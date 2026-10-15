#!/usr/bin/env node
/**
 * Headless GPU render driver.
 *
 *   node scripts/gpu-render.mjs --ir <scene-ir-shot.json> --out <dir> [--frames N] [--from F] [--step S]
 *
 * Starts the static server, converts SceneIR into GPU buffers, opens the renderer page in
 * headless Chrome, and lets the page POST finished PNGs back. One Chrome process renders a whole
 * batch, so the per-frame cost is the render, not a process spawn.
 *
 * VIDEO OUTPUT IS NOT DELIVERED THIS WAY. The deliverables still come from Remotion/ffmpeg using
 * the existing grid pipeline; this driver exists to render and compare GPU frames. Wiring the GPU
 * renderer into the delivery chain is a separate decision (see docs/adr/0001) and is not implied
 * by this script existing.
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const { startServer } = await import("./gpu-serve.mjs");
const { buildGpuScene, encodeWire } = await import(path.join(ROOT, "dist", "src", "render", "gpu", "bridge.js"));

const irPath = arg("ir");
if (!irPath) {
  process.stderr.write("usage: gpu-render.mjs --ir <scene-ir-shot.json> --out <dir> [--frames N] [--from F] [--step S] [--frame F]\n");
  process.exit(2);
}
const outDir = path.resolve(arg("out", path.join(ROOT, "out", "gpu")));
const family = arg("family", "printable");
const from = Number(arg("from", arg("frame", "0")));
const count = Number(arg("frames", "1"));
const step = Number(arg("step", "1"));
const scale = Number(arg("scale", "1"));
const width = arg("width") ? Number(arg("width")) : null;
const height = arg("height") ? Number(arg("height")) : null;

const ir = JSON.parse(await readFile(path.resolve(irPath), "utf8"));
if (width) ir.width = width;
if (height) ir.height = height;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// one wire document per requested frame, so the page stays a pure renderer
const wireDir = path.join(ROOT, ".gpu-wire");
await rm(wireDir, { recursive: true, force: true });
await mkdir(wireDir, { recursive: true });

const { server, url, port } = await startServer(0);

/**
 * Per-frame scenes differ only in camera and density, but the bridge is cheap compared to a
 * Chrome launch, so a wire document is written per rendered frame and the page fetches one.
 */
const frameList = [];
for (let k = 0; k < count; k++) frameList.push(from + k * step);

const t0 = Date.now();
let pageError = null;

for (const fi of frameList) {
  const scene = buildGpuScene(ir, { frame: fi, family: family === "printable" ? "printable" : family });
  const wire = encodeWire(scene, fi);
  // fovY is needed by the page to build the projection, and it is a camera property
  const key = ir.camera.keys.find((k) => k.frame === fi) ?? ir.camera.keys[0];
  wire.meta.fovY = key.fovY;
  const wireName = `wire-${fi}.json`;
  await writeFile(path.join(wireDir, wireName), JSON.stringify(wire));

  const pageUrl =
    `${url}/src/render/gpu/web/index.html?scene=${encodeURIComponent(`/.gpu-wire/${wireName}`)}` +
    `&dir=${encodeURIComponent(outDir)}&from=${fi}&count=1&step=1&scale=${scale}`;

  const result = await runChrome(pageUrl);
  const parsed = parseResult(result.stdout);
  if (parsed?.error) pageError = parsed.error;
  const status = parsed?.status ?? "";
  process.stdout.write(
    `  frame ${String(fi).padStart(4)}  prims ${String(scene.count).padStart(6)}  ` +
      `${parsed?.error ? "ERROR" : "ok"}\n`,
  );
  // Surface the page's own report. A black frame has several possible causes and the page is
  // the only thing that can measure which one it is, so its diagnostics are printed verbatim.
  if (status) process.stdout.write(`      ${status.replace(/\s+/g, " ").slice(0, 400)}\n`);
}

server.close();
await rm(wireDir, { recursive: true, force: true });

// the page writes frames; the video path is the existing ffmpeg flow
const nPng = (await readdir(outDir)).filter((f) => f.endsWith(".png")).length;
const ms = Date.now() - t0;
process.stdout.write(`\ngpu render  ${nPng}/${frameList.length} frames  ${(ms / 1000).toFixed(1)}s  -> ${path.relative(ROOT, outDir)}\n`);
if (pageError) {
  process.stderr.write(`\nPAGE ERROR:\n${pageError}\n`);
  process.exit(1);
}

/** Launch Chrome headless, dump the DOM, and read the page's result out of it. */
function runChrome(pageUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--enable-unsafe-swiftshader",
        "--use-angle=metal",
        "--hide-scrollbars",
        "--window-size=1920,1080",
        // a generous virtual-time budget: the page must finish every render and upload before
        // the DOM is dumped, and the dump is the only channel back to Node
        "--virtual-time-budget=600000",
        "--dump-dom",
        pageUrl,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", () => resolve({ stdout: out, stderr: err }));
  });
}

/**
 * The page writes `window.__result` and `window.__error`, but `--dump-dom` only renders the DOM.
 * The status element carries the same information, which is why the page mirrors every message
 * into `#status` with a stable prefix.
 */
function parseResult(dom) {
  const m = /id="status">([\s\S]*?)<\/div>/.exec(dom);
  const status = m ? m[1].trim() : "";
  if (status.startsWith("ERROR") || /^ERROR:/.test(status)) return { error: status.replace(/^ERROR:\s*/, "") };
  if (!status || status === "booting") {
    return { error: `page never reported a result (status: ${JSON.stringify(status)})` };
  }
  return { status };
}
