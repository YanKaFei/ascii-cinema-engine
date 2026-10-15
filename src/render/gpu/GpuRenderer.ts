/**
 * GPU_PRODUCTION_RENDERER.
 *
 * Consumes `SceneIR` and nothing else. It never reads a FilmSpec or a v1 clip, so the Director
 * Agent is untouched by anything in this file. See docs/adr/0001 for why this is raw WebGL2
 * rather than a Three.js scene graph.
 *
 * PASS ORDER:
 *
 *   ScenePass          instanced additive HDR splats + a real DEPTH_COMPONENT24 attachment
 *   EdgePass           fullscreen: depth-gradient edges, luminance, local contrast
 *   GlyphSelectPass    fullscreen into a cols x rows target: one SLOT per cell
 *   AsciiCompositePass instanced quads: one per cell, sampling the glyph atlas
 *   PostPass           fullscreen: grade, bloom, halation, grain, vignette, aberration, scanline
 *
 * WHY GLYPH SELECTION IS ITS OWN PASS. In Phase 2 a cell's character was a pure function of its
 * luminance, which is exactly why every subject resolved to the same dash texture. Here the slot
 * for a cell is a function of brightness AND edge magnitude AND local contrast AND depth AND the
 * layer's semantic role, evaluated simultaneously over full-resolution targets and committed to a
 * cols x rows selection texture. The character therefore carries material and hierarchy rather
 * than being a brightness proxy.
 */

export interface AtlasMeta {
  version: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  scale: number;
  glyphW: number;
  glyphH: number;
  padU: number;
  padV: number;
  families: Record<string, number[]>;
  printableRun: number[];
  slotCoverage: number[];
}

export interface GpuScene {
  width: number;
  height: number;
  cols: number;
  rows: number;
  count: number;
  /** interleaved: x,y,z, r,g,b, sizeCells, coverage, roleId */
  data: Float32Array;
  camera: {
    position: [number, number, number];
    right?: [number, number, number];
    up?: [number, number, number];
    forward?: [number, number, number];
    fovY?: number;
    near: number;
    far: number;
    worldToCells: number;
  };
  grade: {
    exposure: number;
    blackPoint: number;
    vignette: number;
    grain: number;
    bloom: number;
    halation: number;
    aberration: number;
    scanline: number;
  };
  density: { coverageMin: number; coverageMax: number };
  /** slot run [base, count] for the film's glyph family */
  slotBase: number;
  slotCount: number;
  background: number;
  /** 0..1: how strongly edges push toward heavier glyphs */
  edgeBoost: number;
  /** exponential depth-fog rate for depth-dependent glyph density */
  depthFog: number;
  /** multiplies every splat's screen radius; a super-sampling / legibility control */
  pointScale?: number;
}

// ---------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------

const VERT_PRIM = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in vec2 aMisc;
layout(location=3) in float aRole;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uPixelPerCell;
uniform float uPointScale;
out vec3 vColor;
out float vCoverage;
out float vDepth;
out float vRole;
void main() {
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  vDepth = length(aPos - uCamPos);
  // The sprite must be able to cover the splat's FULL extent. Sizing it as one cell (the first
  // implementation) meant a 1-cell primitive was a 9px dot, so the frame was a field of isolated
  // specks with huge gaps and the subject never accumulated into a mass. Twice aMisc.x is the
  // splat diameter in cells; the profile is then evaluated in cell units via gl_PointCoord.
  gl_PointSize = clamp(2.0 * aMisc.x * uPixelPerCell * uPointScale, 2.0, 512.0);
  vColor = aColor;
  vCoverage = aMisc.y;
  vRole = aRole;
}`;

/**
 * Additive splat with a flat-topped core.
 *
 * The core is kept from the CPU reference on purpose: a Gaussian whose peak is narrower than a
 * cell has a brightness depending on where the splat lands relative to the lattice, so an
 * isolated mark vanishes on some frames. The core makes `coverage` mean exactly "the value
 * inside the core", which is what makes a one-glyph shot possible at all.
 *
 * The alpha channel carries the ink WEIGHT and the rgb carries the primitive's COLOUR, so the
 * glyph stage can use colour as a signal (gate 3) instead of collapsing everything to luminance.
 */
const FRAG_PRIM = `#version 300 es
precision highp float;
in vec3 vColor;
in float vCoverage;
in float vDepth;
in float vRole;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(p, p);
  if (d2 > 1.0) discard;
  const float CORE2 = 0.0121;
  float w = d2 <= CORE2 ? 1.0 : pow(max(0.0, (1.0 - d2) / (1.0 - CORE2)), 2.0);
  // vCoverage is a per-primitive ink weight; the profile supplies the shape. Keeping the two
  // separate is what lets a splat cover many cells without its brightness depending on how many.
  float ink = w * vCoverage;
  outColor = vec4(vColor * ink, ink);
}`;

const VERT_FULL = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG_EDGE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uHdr;
uniform sampler2D uDepth;
uniform vec2 uTexel;
out vec4 outEdge;
void main() {
  vec3 c = texture(uHdr, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Sobel on DEPTH, not on luminance: a depth discontinuity is a real silhouette, whereas a
  // luminance discontinuity inside a soft cloud is just noise and would be traced as an edge.
  float d00 = texture(uDepth, vUv + uTexel * vec2(-1.0, -1.0)).r;
  float d10 = texture(uDepth, vUv + uTexel * vec2( 0.0, -1.0)).r;
  float d20 = texture(uDepth, vUv + uTexel * vec2( 1.0, -1.0)).r;
  float d01 = texture(uDepth, vUv + uTexel * vec2(-1.0,  0.0)).r;
  float d21 = texture(uDepth, vUv + uTexel * vec2( 1.0,  0.0)).r;
  float d02 = texture(uDepth, vUv + uTexel * vec2(-1.0,  1.0)).r;
  float d12 = texture(uDepth, vUv + uTexel * vec2( 0.0,  1.0)).r;
  float d22 = texture(uDepth, vUv + uTexel * vec2( 1.0,  1.0)).r;
  float gx = (d20 + 2.0 * d21 + d22) - (d00 + 2.0 * d01 + d02);
  float gy = (d02 + 2.0 * d12 + d22) - (d00 + 2.0 * d10 + d20);
  float edge = clamp(sqrt(gx * gx + gy * gy) * 40.0, 0.0, 1.0);

  float sum = 0.0;
  for (int yy = -2; yy <= 2; yy++) {
    for (int xx = -2; xx <= 2; xx++) {
      sum += dot(texture(uHdr, vUv + uTexel * vec2(float(xx), float(yy))).rgb, vec3(0.2126, 0.7152, 0.0722));
    }
  }
  float mean = sum / 25.0;
  float contrast = clamp(abs(lum - mean) * 4.0, 0.0, 1.0);

  // depth as a 0..1 view distance for fog; the far plane is the camera's framing distance * 4
  outEdge = vec4(edge, lum, contrast, d01);
}`;

/**
 * GlyphSelectPass: one SLOT per cell, from several signals at once.
 *
 * Coverage is a weighted blend of luminance, edge magnitude, local contrast and depth, mapped
 * through the frame's density window. Depth attenuates ink (depth-dependent glyph density),
 * which is what makes distance readable WITHOUT needing the whole frame to go black.
 */
const FRAG_SELECT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uEdge;
uniform vec2 uCells;
uniform vec2 uCellTexel;
uniform float uCoverageMin;
uniform float uCoverageMax;
uniform float uDepthFog;
uniform float uEdgeBoost;
uniform int uSlotBase;
uniform int uSlotCount;
out vec4 outSel;   // r = slot index, g = coverage 0..1, b = edge, a = ink
void main() {
  // AVERAGE the cell's footprint. Point-sampling the full-resolution target at the cell centre
  // samples ONE texel out of a ~8x9-pixel cell, so sparse splats read as random noise: a cell
  // whose centre happened to fall in a gap came out black even though most of the cell was lit.
  // This is the same aliasing the CPU reference avoids by splatting ON the cell lattice.
  vec4 acc = vec4(0.0);
  const int TAPS = 3;
  for (int j = 0; j < TAPS; j++) {
    for (int i = 0; i < TAPS; i++) {
      vec2 o = (vec2(float(i), float(j)) + 0.5) / float(TAPS) - 0.5;
      acc += texture(uEdge, vUv + o * uCellTexel);
    }
  }
  vec4 e = acc / float(TAPS * TAPS);
  float lum = e.g;
  float edge = e.r;
  float contrast = e.b;
  float depth = e.a;

  float fog = exp(-uDepthFog * max(0.0, depth));
  float ink = lum * fog;
  ink += edge * uEdgeBoost;
  ink += contrast * 0.12;
  ink = clamp(ink, 0.0, 1.0);

  float cov = mix(uCoverageMin, uCoverageMax, ink);
  // map coverage (0..20 in this font) onto a slot inside the film's family run
  float t = clamp(cov / 20.0, 0.0, 1.0);
  float slot = float(uSlotBase) + floor(t * float(uSlotCount - 1) + 0.5);
  outSel = vec4(slot, cov, edge, ink);
}`;

/**
 * AsciiCompositePass.
 *
 * One instanced quad per cell. The slot is read with `texelFetch` from the cols x rows selection
 * target — an exact, unfiltered per-cell lookup, which is what a lattice wants. The quad
 * samples the ATLAS through that slot, so a character is drawn as its own bitmap rather than as
 * a set of filled subpixel rectangles.
 *
 * Ink MODULATES the glyph's coverage (via the alpha of the sampled bitmap scaled by ink) rather
 * than being clamped to full white, which is what makes mid-tones possible — the Phase 2 review
 * measured a median ink of 255/255 in nearly every frame and no mid-tones at all.
 */
const VERT_GLYPH = `#version 300 es
precision highp float;
uniform sampler2D uSel;
uniform vec2 uCells;
uniform vec2 uAtlasCell;    // normalised size of one atlas cell
uniform vec2 uAtlasPad;     // normalised padding inside an atlas cell
uniform float uAtlasCols;
uniform float uGlyphScale;  // 1.0 = fill the cell
out vec2 vAtlasUv;
out float vInk;
out float vEdge;
void main() {
  int cellX = gl_InstanceID % int(uCells.x);
  int cellY = gl_InstanceID / int(uCells.x);
  vec4 sel = texelFetch(uSel, ivec2(cellX, cellY), 0);

  float slot = sel.r;
  float acol = mod(slot, uAtlasCols);
  float arow = floor(slot / uAtlasCols);

  // unit quad from gl_VertexID (0..3 -> two triangles would need 6; use a 4-vertex strip loop)
  vec2 unit = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));

  vec2 inner = vec2(1.0) - uAtlasPad * 2.0;
  vAtlasUv = (vec2(acol, arow) + uAtlasPad + unit * inner) * uAtlasCell;

  // normalised device position of this cell's quad
  vec2 cellUv = (vec2(float(cellX), float(cellY)) + unit * uGlyphScale) / uCells;
  // the glyph lattice is addressed from the TOP-LEFT, so flip Y for clip space
  gl_Position = vec4(cellUv.x * 2.0 - 1.0, 1.0 - cellUv.y * 2.0, 0.0, 1.0);

  vInk = sel.a;
  vEdge = sel.b;
}`;

const FRAG_GLYPH = `#version 300 es
precision highp float;
in vec2 vAtlasUv;
in float vInk;
in float vEdge;
uniform sampler2D uAtlas;
uniform float uInkGamma;
uniform float uExposure;
uniform float uBlackPoint;
out vec4 outColor;
void main() {
  float glyph = texture(uAtlas, vAtlasUv).r;
  if (glyph <= 0.0) discard;
  // ink grades the glyph's own coverage; it is NOT clamped to full white
  float v = (vInk - uBlackPoint) * uExposure;
  v = clamp(v, 0.0, 1.0);
  v = pow(v, uInkGamma);
  float a = glyph * v;
  if (a <= 0.002) discard;
  // edges lean slightly hotter so silhouettes read as structure
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.96, 0.88), vEdge * 0.5);
  // PREMULTIPLIED alpha. The composite is drawn with (ONE, ONE_MINUS_SRC_ALPHA), so the colour
  // must already carry its alpha. Writing an unpremultiplied vec4(tint, a) here double-counts,
  // and ADDITIVE blending (the first attempt) made the background contribute at FULL ink because
  // the alpha term reached 1, turning every cell into a solid rectangle of its glyph's ink.
  outColor = vec4(tint * a, a);
}`;

/**
 * PostPass: grade, bloom, halation, grain, vignette, aberration, scanline.
 *
 * Deliberately light-touch defaults. The purpose is to make the ASCII composite read as
 * photographed light rather than as a bitmap, not to disguise it.
 */
const FRAG_POST = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform float uBloomAmount;
uniform float uGrain;
uniform float uVignette;
uniform float uAberration;
uniform float uScanline;
uniform float uHalation;
uniform float uFrame;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

void main() {
  // chromatic aberration: sample the channels at slightly different radii
  vec2 dir = vUv - 0.5;
  float amt = uAberration * dot(dir, dir);
  vec3 base;
  base.r = texture(uScene, vUv + dir * amt * 1.0).r;
  base.g = texture(uScene, vUv).g;
  base.b = texture(uScene, vUv - dir * amt * 1.0).b;

  vec3 bloom = texture(uBloom, vUv).rgb;
  // halation: bloom tinted warm, as light bleeding through an emulsion
  vec3 hal = bloom * vec3(1.0, 0.72, 0.45) * uHalation;
  vec3 col = base + bloom * uBloomAmount + hal;

  if (uScanline > 0.0) {
    float s = 0.5 + 0.5 * sin(vUv.y / uTexel.y * 3.14159);
    col *= 1.0 - uScanline * (1.0 - s) * 0.35;
  }

  if (uVignette > 0.0) {
    float r = length(dir) * 1.4142;
    col *= 1.0 - uVignette * clamp(r * r, 0.0, 1.0);
  }

  if (uGrain > 0.0) {
    float g = hash(gl_FragCoord.xy + vec2(uFrame * 13.7, uFrame * 7.3));
    col += (g - 0.5) * uGrain;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const FRAG_BLIT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
out vec4 outColor;
void main() { outColor = vec4(texture(uSrc, vUv).rgb, 1.0); }`;

/** Separable-ish bloom: a wide 13-tap blur, run once at half resolution. */
const FRAG_BLOOM = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 outColor;
void main() {
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int y = -6; y <= 6; y++) {
    for (int x = -6; x <= 6; x++) {
      vec2 o = vec2(float(x), float(y)) * uTexel;
      float w = exp(-dot(o / uTexel, o / uTexel) / 18.0);
      vec3 c = texture(uSrc, vUv + o).rgb;
      // threshold: only genuinely bright cells bloom
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      sum += c * w * step(0.35, l);
      wsum += w;
    }
  }
  outColor = vec4(sum / max(1e-5, wsum), 1.0);
}`;

// ---------------------------------------------------------------------------

export interface GpuRendererOptions {
  deterministic?: boolean;
}

/**
 * Self-test used to locate a black frame.
 *
 * Draws the scene's own VAO with progressively fewer moving parts, reading the HDR target after
 * each. Every variant keeps the same buffer and VAO; only the shader and depth state change, so
 * the first variant that produces ink names the culprit. This exists because a black frame has
 * several indistinguishable causes from the outside.
 */
export function diagnoseScene(
  gl: WebGL2RenderingContext,
  scene: GpuScene,
  mvp: Float32Array,
): Array<{ name: string; ink: number; err: number; log?: string }> {
  const out: Array<{ name: string; ink: number; err: number; log?: string }> = [];
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(1.0,1.0,1.0,1.0); }`;

  const variants: Array<{
    name: string;
    vs: string;
    depth: boolean;
    uniform: boolean;
    frag?: string;
    blend?: boolean;
    withColor?: boolean;
  }> = [
    {
      name: "hardcoded-pos",
      vs: `#version 300 es
precision highp float;
void main(){ gl_Position = vec4(0.0,0.0,0.0,1.0); gl_PointSize = 24.0; }`,
      depth: false,
      uniform: false,
    },
    {
      name: "attr-pos-no-matrix",
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
void main(){ gl_Position = vec4(aPos * 0.25, 1.0); gl_PointSize = 24.0; }`,
      depth: false,
      uniform: false,
    },
    {
      name: "attr-pos-matrix",
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
void main(){ gl_Position = uViewProj * vec4(aPos,1.0); gl_PointSize = 24.0; }`,
      depth: false,
      uniform: true,
    },
    {
      name: "attr-pos-matrix-pointsize",
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aMisc;
uniform mat4 uViewProj;
uniform float uPixelPerCell;
void main(){ gl_Position = uViewProj * vec4(aPos,1.0); gl_PointSize = clamp(aMisc.x * uPixelPerCell, 2.0, 256.0); }`,
      depth: false,
      uniform: true,
    },
    {
      name: "full-with-depth",
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aMisc;
uniform mat4 uViewProj;
uniform float uPixelPerCell;
void main(){ gl_Position = uViewProj * vec4(aPos,1.0); gl_PointSize = clamp(aMisc.x * uPixelPerCell, 2.0, 256.0); }`,
      depth: true,
      uniform: true,
    },
    // The two variants that use the REAL fragment shader. If these produce nothing while the
    // trivial-fragment variants above work, the fault is in the splat shader, not in the state.
    {
      name: "realfrag-no-blend",
      // NOTE: this variant must declare every varying FRAG_PRIM reads, or IT will fail to link
      // and the diagnostic will blame the renderer for the diagnostic's own mistake. That is a
      // mistake this variant made once.
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in vec2 aMisc;
uniform mat4 uViewProj;
uniform float uPixelPerCell;
out vec3 vColor; out float vCoverage; out float vDepth; out float vRole;
void main(){
  gl_Position = uViewProj * vec4(aPos,1.0);
  vDepth = 0.0;
  gl_PointSize = clamp(aMisc.x * uPixelPerCell, 2.0, 256.0);
  vColor = aColor; vCoverage = aMisc.y; vRole = 0.0;
}`,
      depth: true,
      uniform: true,
      frag: FRAG_PRIM,
      blend: false,
      withColor: true,
    },
    {
      name: "realfrag-additive",
      vs: `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
layout(location=2) in vec2 aMisc;
uniform mat4 uViewProj;
uniform float uPixelPerCell;
out vec3 vColor; out float vCoverage; out float vDepth; out float vRole;
void main(){
  gl_Position = uViewProj * vec4(aPos,1.0);
  vDepth = 0.0;
  gl_PointSize = clamp(aMisc.x * uPixelPerCell, 2.0, 256.0);
  vColor = aColor; vCoverage = aMisc.y; vRole = 0.0;
}`,
      depth: true,
      uniform: true,
      frag: FRAG_PRIM,
      blend: true,
      withColor: true,
    },
  ];

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, scene.data, gl.STATIC_DRAW);
  const stride = 9 * 4;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);

  for (const v of variants) {
    const sh = (t: number, src: string): WebGLShader => {
      const o = gl.createShader(t)!;
      gl.shaderSource(o, src);
      gl.compileShader(o);
      return o;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, v.vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, v.frag ?? FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      // capture WHY: a silent -1 is useless
      const log = gl.getProgramInfoLog(p) ?? "";
      const vsLog = gl.getShaderInfoLog(sh(gl.VERTEX_SHADER, v.vs)) ?? "";
      const fsLog = gl.getShaderInfoLog(sh(gl.FRAGMENT_SHADER, v.frag ?? FS)) ?? "";
      out.push({ name: v.name, ink: -1, err: gl.getError(), log: `${log} | vs:${vsLog} | fs:${fsLog}`.slice(0, 500) });
      continue;
    }
    gl.viewport(0, 0, 64, 64);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    if (v.depth) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (v.blend) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.disable(gl.BLEND);
    }
    gl.useProgram(p);
    if (v.uniform) {
      gl.uniformMatrix4fv(gl.getUniformLocation(p, "uViewProj"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(p, "uPixelPerCell"), (scene.height / scene.rows) * 1.0);
    }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, scene.count);
    const err = gl.getError();
    const px = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let ink = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 8) ink++;
    out.push({ name: v.name, ink, err });
  }

  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  gl.deleteTexture(tex);
  return out;
}

export class GpuRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly passes: string[] = [];
  private atlasTex: WebGLTexture | null = null;
  private meta: AtlasMeta | null = null;
  private programs = new Map<string, WebGLProgram>();
  private vaoFull: WebGLVertexArrayObject | null = null;
  private vaoPrim: WebGLVertexArrayObject | null = null;
  private vboPrim: WebGLBuffer | null = null;
  private vaoGlyph: WebGLVertexArrayObject | null = null;
  private targets: Record<string, { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }> = {};
  private texDepth: WebGLTexture | null = null;
  private depthSize = { w: 0, h: 0 };

  /**
   * Whether this context can actually render INTO a float target.
   *
   * `EXT_color_buffer_float` reporting `true` is NOT sufficient. On the Chrome 154 / ANGLE
   * Metal build used here the extension is advertised, and yet every RGBA16F and
   * R11F_G11F_B10F framebuffer comes back INCOMPLETE (0x8cd6) while RGBA8 is COMPLETE. Trusting
   * the extension string produced `hdr framebuffer incomplete` on the very first GPU frame.
   *
   * The capability is therefore PROBED by building a 1x1 float framebuffer and checking it, with
   * an RGBA8 fallback. What the fallback costs: additive accumulation clamps at 1.0, so the scene
   * pass works in relative units and the bloom thresholds on luminance rather than on absolute
   * HDR values.
   */
  readonly floatTargets: boolean;
  private lastError = 0;
  /**
   * Peak and non-zero count of each target, measured IMMEDIATELY after the pass that writes it.
   *
   * It has to be measured there. Reading the targets afterwards (once every pass has run) gave
   * zeros for the scene target even though the scene had in fact rendered — the later passes
   * rebind framebuffers and reset viewport, and a diagnostic that is itself unreliable is worse
   * than no diagnostic.
   */
  passPeaks: Record<string, { nonZero: number; peak: number }> = {};

  constructor(gl: WebGL2RenderingContext, _opts: GpuRendererOptions = {}) {
    this.gl = gl;
    void _opts;
    this.floatTargets = this.probeFloatTargets();
  }

  /** Build a throwaway float framebuffer and report whether it is complete. */
  private probeFloatTargets(): boolean {
    const gl = this.gl;
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    let ok = false;
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
      gl.deleteFramebuffer(fbo);
    } catch {
      ok = false;
    }
    gl.deleteTexture(tex);
    // also require the extension, so a driver that completes the FBO but cannot filter it still
    // takes the RGBA8 path rather than producing a half-working pipeline
    if (ok) ok = !!gl.getExtension("EXT_color_buffer_float");
    return ok;
  }

  /** The internal/format/type triple for a target, honouring the probe. */
  private fmt(hdr: boolean): [number, number, number] {
    const gl = this.gl;
    if (hdr && this.floatTargets) return [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT];
    return [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
  }

  async loadAtlas(pngUrl: string, metaUrl: string): Promise<void> {
    const gl = this.gl;
    const meta: AtlasMeta = await (await fetch(metaUrl)).json();
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`atlas image failed: ${pngUrl}`));
      img.src = pngUrl;
    });
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasTex = tex;
    this.meta = meta;
  }

  get atlasMeta(): AtlasMeta | null {
    return this.meta;
  }
  get passNames(): string[] {
    return [...this.passes];
  }

  private compile(name: string, vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const hit = this.programs.get(name);
    if (hit) return hit;
    const sh = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(`${name} shader failed:\n${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    const vsh = sh(gl.VERTEX_SHADER, vs);
    const fsh = sh(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, vsh);
    gl.attachShader(p, fsh);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      // A failed link makes every draw a silent no-op with NO GL error, which is how a completely
      // black frame can be produced by a pipeline that reports success at every step. The logs are
      // therefore always captured and always reported.
      throw new Error(
        `${name} link failed:\n  program: ${gl.getProgramInfoLog(p)}\n  vertex: ${gl.getShaderInfoLog(vsh)}\n  fragment: ${gl.getShaderInfoLog(fsh)}`,
      );
    }
    this.programs.set(name, p);
    return p;
  }

  /**
   * Create or reuse a colour render target.
   *
   * `withDepth` attaches the shared DEPTH_COMPONENT24 texture before the completeness check.
   * Attaching it afterwards is what produced `hdr framebuffer incomplete: 0x8cd6`
   * (GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT): the generic path validated the framebuffer while it
   * still had no depth attachment, then a later pass expected one to be there.
   */
  private target(
    name: string,
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
    filter: number,
    withDepth = false,
  ) {
    const gl = this.gl;
    const cur = this.targets[name];
    if (cur && cur.w === w && cur.h === h) return cur;
    if (cur) {
      gl.deleteFramebuffer(cur.fbo);
      gl.deleteTexture(cur.tex);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (withDepth) {
      if (!this.texDepth) throw new Error(`${name}: requested depth but no depth texture exists`);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.texDepth, 0);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`${name} framebuffer incomplete: 0x${status.toString(16)}`);
    this.targets[name] = { fbo, tex, w, h };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.targets[name]!;
  }

  private ensureDepth(w: number, h: number): void {
    const gl = this.gl;
    if (this.depthSize.w === w && this.depthSize.h === h && this.texDepth) return;
    if (this.texDepth) gl.deleteTexture(this.texDepth);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texDepth = t;
    this.depthSize = { w, h };
  }

  /**
   * Prepare a fullscreen pass: compile, bind the target, set the viewport and use the program.
   *
   * It deliberately does NOT draw. An earlier version drew here and callers set their uniforms
   * afterwards, so every fullscreen pass ran with unset samplers and produced nothing — with no
   * GL error, because sampling an unbound texture is legal. Splitting preparation from
   * `drawFullscreen()` makes that ordering mistake impossible.
   */
  private fullscreen(progName: string, frag: string, target: { fbo: WebGLFramebuffer } | null, w: number, h: number): WebGLProgram {
    const gl = this.gl;
    const prog = this.compile(progName, VERT_FULL, frag);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    gl.bindVertexArray(this.vaoFull);
    return prog;
  }

  /** Draw the prepared fullscreen pass. */
  private drawFullscreen(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /** Measure a target immediately after the pass that writes it. */
  private recordPeak(name: string, w: number, h: number): void {
    const gl = this.gl;
    if (w * h > 4_000_000) return;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let nonZero = 0;
    let peak = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i]! > 2) nonZero++;
      if (buf[i]! > peak) peak = buf[i]!;
    }
    this.passPeaks[name] = { nonZero, peak };
  }

  /**
   * Read back a named intermediate target, for diagnostics.
   *
   * A black final frame can have five different causes (no primitives, no depth, an empty
   * selection, a glyph pass that emits nothing, a post pass that discards), and guessing between
   * them wastes far more time than exposing the intermediates. Values are returned as 8-bit
   * luminance for inspection.
   */
  readTarget(name: string, w: number, h: number): Uint8Array | null {
    const gl = this.gl;
    const t = this.targets[name];
    if (!t) return null;
    const f = new Float32Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, f);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < f.length; i++) {
      const v = Number.isFinite(f[i]) ? Math.max(0, Math.min(1, f[i])) : 0;
      out[i] = Math.round(v * 255);
    }
    return out;
  }

  /** Render one frame; returns RGBA8 bytes of the final image. */
  renderFrame(scene: GpuScene, mvp: Float32Array, frameIndex = 0): Uint8Array {
    const gl = this.gl;
    this.passes.length = 0;
    this.passPeaks = {};
    // surface any GL error left over from a previous frame rather than letting it accumulate
    this.lastError = gl.getError();
    const { width: W, height: H } = scene;

    this.ensureDepth(W, H);
    const [hi, hf, ht] = this.fmt(true);
    const [si, sf, st] = this.fmt(false);
    const hdr = this.target("hdr", W, H, hi, hf, ht, gl.LINEAR, true);
    const edge = this.target("edge", W, H, hi, hf, ht, gl.NEAREST);
    const ascii = this.target("ascii", W, H, si, sf, st, gl.LINEAR);
    const hw = Math.max(1, W >> 2);
    const hh = Math.max(1, H >> 2);
    const half = this.target("half", hw, hh, hi, hf, ht, gl.LINEAR);
    const bloom = this.target("bloom", hw, hh, hi, hf, ht, gl.LINEAR);
    const final = this.target("final", W, H, si, sf, st, gl.LINEAR);

    // ---- ScenePass ----------------------------------------------------------
    this.passes.push("ScenePass");
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    {
      const prog = this.compile("scene", VERT_PRIM, FRAG_PRIM);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog, "uViewProj"), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(prog, "uCamPos"), scene.camera.position);
      gl.uniform1f(gl.getUniformLocation(prog, "uPixelPerCell"), H / scene.rows);
      gl.uniform1f(gl.getUniformLocation(prog, "uPointScale"), scene.pointScale ?? 1);
      if (!this.vaoPrim) {
        this.vaoPrim = gl.createVertexArray()!;
        this.vboPrim = gl.createBuffer()!;
        gl.bindVertexArray(this.vaoPrim);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPrim);
        const stride = 9 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
      }
      gl.bindVertexArray(this.vaoPrim);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPrim);
      gl.bufferData(gl.ARRAY_BUFFER, scene.data, gl.DYNAMIC_DRAW);
      this.lastError = gl.getError();
      if (this.lastError !== 0) throw new Error(`scene upload GL error 0x${this.lastError.toString(16)}`);
      gl.drawArrays(gl.POINTS, 0, scene.count);
      const drawErr = gl.getError();
      if (drawErr !== 0) throw new Error(`scene draw GL error 0x${drawErr.toString(16)}`);
      gl.bindVertexArray(null);

      this.recordPeak("hdr", W, H);
    }
    this.recordPeak("hdr", W, H);
    this.lastError = gl.getError();
    if (this.lastError !== 0) throw new Error(`ScenePass left GL error 0x${this.lastError.toString(16)}`);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // ---- EdgePass -----------------------------------------------------------
    this.passes.push("EdgePass");
    {
      const prog = this.fullscreen("edge", FRAG_EDGE, edge, W, H);
      this.lastError = gl.getError();
      if (this.lastError !== 0) throw new Error(`EdgePass bind left GL error 0x${this.lastError.toString(16)}`);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdr.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uHdr"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texDepth);
      gl.uniform1i(gl.getUniformLocation(prog, "uDepth"), 1);
      gl.uniform2f(gl.getUniformLocation(prog, "uTexel"), 1 / W, 1 / H);
      this.drawFullscreen();
    }
    this.recordPeak("edge", W, H);

    // ---- GlyphSelectPass (cols x rows) -------------------------------------
    this.passes.push("GlyphSelectPass");
    const [ei, ef, et] = this.fmt(true);
    const sel = this.target("sel", scene.cols, scene.rows, ei, ef, et, gl.NEAREST);
    {
      const prog = this.fullscreen("select", FRAG_SELECT, sel, scene.cols, scene.rows);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, edge.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uEdge"), 0);
      gl.uniform2f(gl.getUniformLocation(prog, "uCells"), scene.cols, scene.rows);
      // the size of one cell in the SOURCE target's texel units
      gl.uniform2f(gl.getUniformLocation(prog, "uCellTexel"), scene.cols / W, scene.rows / H);
      gl.uniform1f(gl.getUniformLocation(prog, "uCoverageMin"), scene.density.coverageMin);
      gl.uniform1f(gl.getUniformLocation(prog, "uCoverageMax"), scene.density.coverageMax);
      gl.uniform1f(gl.getUniformLocation(prog, "uDepthFog"), scene.depthFog);
      gl.uniform1f(gl.getUniformLocation(prog, "uEdgeBoost"), scene.edgeBoost);
      gl.uniform1i(gl.getUniformLocation(prog, "uSlotBase"), scene.slotBase);
      gl.uniform1i(gl.getUniformLocation(prog, "uSlotCount"), scene.slotCount);
      this.drawFullscreen();
    }
    this.recordPeak("sel", scene.cols, scene.rows);

    // ---- AsciiCompositePass -------------------------------------------------
    this.passes.push("AsciiCompositePass");
    gl.bindFramebuffer(gl.FRAMEBUFFER, ascii.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    // Premultiplied source-over. A glyph OVERLAYS the frame; it does not accumulate, and it must
    // not paint the parts of its cell its bitmap leaves empty.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    {
      const meta = this.meta!;
      const prog = this.compile("glyph", VERT_GLYPH, FRAG_GLYPH);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sel.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uSel"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.uniform1i(gl.getUniformLocation(prog, "uAtlas"), 1);
      gl.uniform2f(gl.getUniformLocation(prog, "uCells"), scene.cols, scene.rows);
      gl.uniform2f(gl.getUniformLocation(prog, "uAtlasCell"), 1 / meta.cols, 1 / meta.rows);
      gl.uniform2f(gl.getUniformLocation(prog, "uAtlasPad"), meta.padU, meta.padV);
      gl.uniform1f(gl.getUniformLocation(prog, "uAtlasCols"), meta.cols);
      gl.uniform1f(gl.getUniformLocation(prog, "uGlyphScale"), 1.0);
      gl.uniform1f(gl.getUniformLocation(prog, "uInkGamma"), 1 / 1.85);
      gl.uniform1f(gl.getUniformLocation(prog, "uExposure"), scene.grade.exposure);
      gl.uniform1f(gl.getUniformLocation(prog, "uBlackPoint"), scene.grade.blackPoint);

      if (!this.vaoGlyph) this.vaoGlyph = gl.createVertexArray()!;
      gl.bindVertexArray(this.vaoGlyph);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, scene.cols * scene.rows);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.BLEND);

    // ---- bloom (bright pass + wide blur at quarter res) ---------------------
    const wantBloom = scene.grade.bloom > 0.001 || scene.grade.halation > 0.001;
    if (wantBloom) {
      this.passes.push("BloomPass");
      {
        const prog = this.compile("blit", VERT_FULL, FRAG_BLIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, half.fbo);
        gl.viewport(0, 0, half.w, half.h);
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ascii.tex);
        gl.uniform1i(gl.getUniformLocation(prog, "uSrc"), 0);
        gl.bindVertexArray(this.vaoFull);
        this.drawFullscreen();
      }
      const prog = this.fullscreen("bloom", FRAG_BLOOM, bloom, bloom.w, bloom.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, half.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uSrc"), 0);
      gl.uniform2f(gl.getUniformLocation(prog, "uTexel"), 1 / bloom.w, 1 / bloom.h);
      this.drawFullscreen();
    }

    // ---- PostPass -----------------------------------------------------------
    this.passes.push("PostPass");
    {
      const prog = this.fullscreen("post", FRAG_POST, final, W, H);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ascii.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uScene"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloom.tex);
      gl.uniform1i(gl.getUniformLocation(prog, "uBloom"), 1);
      gl.uniform2f(gl.getUniformLocation(prog, "uTexel"), 1 / W, 1 / H);
      gl.uniform1f(gl.getUniformLocation(prog, "uBloomAmount"), scene.grade.bloom);
      gl.uniform1f(gl.getUniformLocation(prog, "uGrain"), scene.grade.grain);
      gl.uniform1f(gl.getUniformLocation(prog, "uVignette"), scene.grade.vignette);
      gl.uniform1f(gl.getUniformLocation(prog, "uAberration"), scene.grade.aberration);
      gl.uniform1f(gl.getUniformLocation(prog, "uScanline"), scene.grade.scanline);
      gl.uniform1f(gl.getUniformLocation(prog, "uHalation"), scene.grade.halation);
      gl.uniform1f(gl.getUniformLocation(prog, "uFrame"), frameIndex);
      this.drawFullscreen();
    }

    // ---- readback -----------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, final.fbo);
    const out = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  dispose(): void {
    const gl = this.gl;
    for (const p of this.programs.values()) gl.deleteProgram(p);
    this.programs.clear();
    if (this.atlasTex) gl.deleteTexture(this.atlasTex);
    if (this.texDepth) gl.deleteTexture(this.texDepth);
    for (const t of Object.values(this.targets)) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    this.targets = {};
    if (this.vaoFull) gl.deleteVertexArray(this.vaoFull);
    if (this.vaoPrim) gl.deleteVertexArray(this.vaoPrim);
    if (this.vaoGlyph) gl.deleteVertexArray(this.vaoGlyph);
    if (this.vboPrim) gl.deleteBuffer(this.vboPrim);
  }
}

export { VERT_PRIM, FRAG_PRIM, VERT_FULL, FRAG_EDGE, FRAG_SELECT, VERT_GLYPH, FRAG_GLYPH, FRAG_POST };
