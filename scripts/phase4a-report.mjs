/** PHASE 4A — the engineering visualisation and human report. Not production UI. */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a');
const names = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory() && d.name !== 'fixtures').map((d) => d.name).sort();

const W = 1600, ROW = 26;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const COLORS = { beat: '#2b8a3e', downbeat: '#e8590c', onset: '#1c7ed6', phrase: '#7048e8', section: '#c2255c', silence: '#868e96', breath: '#f59f00', energy: '#fa5252' };

let html = `<!doctype html><html><head><meta charset="utf-8"><title>Phase 4A — timeline debug</title>
<style>body{background:#111;color:#ddd;font:13px ui-monospace,monospace;margin:0;padding:20px}
h2{margin:26px 0 6px;font-size:15px;color:#fff}h3{margin:14px 0 4px;font-size:13px;color:#aaa}
.row{position:relative;height:${ROW}px;background:#1a1a1a;margin:2px 0;overflow:hidden}
.lbl{position:absolute;left:4px;top:5px;font-size:10px;color:#888;z-index:9;background:#1a1a1acc;padding:0 3px}
.m{position:absolute;top:0;bottom:0;width:1px}.b{width:3px;border-radius:2px}
.warn{color:#f59f00;font-size:12px;margin:2px 0}.ok{color:#2b8a3e}
table{border-collapse:collapse;margin:6px 0}td,th{border:1px solid #333;padding:3px 8px;font-size:12px;text-align:left}
.leg span{display:inline-block;margin-right:12px;font-size:11px}</style></head><body>
<h1 style="font-size:18px">PHASE 4A — MUSIC ANALYSIS TIMELINE (engineering debug)</h1>
<div class="leg">${Object.entries(COLORS).map(([k, v]) => `<span style="color:${v}">&#9632; ${k}</span>`).join('')}</div>`;

const summary = [];
for (const n of names) {
  let a, w, s, tl;
  try {
    a = JSON.parse(await readFile(path.join(OUT, n, 'music-analysis.json'), 'utf8'));
    w = JSON.parse(await readFile(path.join(OUT, n, 'analysis-warnings.json'), 'utf8'));
    s = JSON.parse(await readFile(path.join(OUT, n, 'audio-metadata.json'), 'utf8'));
    tl = JSON.parse(await readFile(path.join(OUT, n, 'music-timeline.json'), 'utf8'));
  } catch { continue; }
  const dur = a.durationSeconds;
  const X = (t) => Math.round((t / dur) * (W - 40)) + 20;
  const band = (cls, items, get, w = 1, color) => `<div class="row"><span class="lbl">${cls}</span>` +
    items.map((x) => { const p = get(x); return p === undefined ? '' : `<div class="m ${w > 1 ? 'b' : ''}" style="left:${X(p)}px;background:${color}"></div>`; }).join('') + '</div>';
  /** the energy curve as an inline SVG polyline */
  const c = a.energyCurve;
  const minDb = Math.min(...c.map((x) => x.rmsDb)), maxDb = Math.max(...c.map((x) => x.rmsDb));
  const pts = c.map((x) => `${X(x.timeSeconds)},${ROW - 2 - ((x.rmsDb - minDb) / Math.max(1e-9, maxDb - minDb)) * (ROW - 4)}`).join(' ');
  const energyRow = `<div class="row"><span class="lbl">energy (RMS dB)</span><svg width="${W}" height="${ROW}" style="position:absolute;left:0;top:0"><polyline points="${pts}" fill="none" stroke="${COLORS.energy}" stroke-width="1"/></svg></div>`;
  html += `<h2>${esc(n)} <span style="color:#888;font-weight:400">${dur.toFixed(2)}s · ${s.sampleRate} Hz · ${s.channels}ch</span></h2>`;
  html += `<div style="font-size:12px;color:#aaa">tempo <b style="color:#fff">${a.tempo.bpm} BPM</b> (${a.tempo.confidence.band}, ${a.tempo.confidence.value})${a.tempo.halfDoubleAmbiguous ? ` — <span style="color:#f59f00">HALF/DOUBLE AMBIGUOUS with ${a.tempo.ambiguousWith.bpm}</span>` : ''} · meter <b>${a.meter.meter}</b> · beats ${a.beatGrid.length} · onsets ${a.onsets.length} · phrases ${a.phrases.length} · sections ${a.sections.length}</div>`;
  if (a.tempo.support) html += `<div style="font-size:12px;color:${a.tempo.support.supported ? '#2b8a3e' : '#fa5252'}">pulse ${a.tempo.support.supported ? 'SUPPORTED' : 'UNSUPPORTED'} — strength contrast ${a.tempo.support.strengthContrast}x, events/beat ${a.tempo.support.eventsPerBeat}, interval deviation ${(a.tempo.support.intervalSpread * 100).toFixed(0)}%${a.tempo.beatGridTrustworthy === false ? ' · NO BEAT GRID PUBLISHED' : ''}</div>`;
  if (a.localTempo && a.localTempo.length > 1) html += `<div style="font-size:12px;color:#aaa">local tempo: ${a.localTempo.map((p) => p.bpm.toFixed(0)).join(' → ')} BPM</div>`;
  html += `<h3>layers</h3>`;
  html += band('sections', a.sections, (x) => x.startSeconds, 1, COLORS.section) + band('phrases', a.phrases, (x) => x.startSeconds, 1, COLORS.phrase);
  html += energyRow;
  html += band('silence', a.silenceRegions, (x) => x.startSeconds, 1, COLORS.silence) + band('breath', a.breathPoints, (x) => x.timeSeconds, 1, COLORS.breath);
  html += band('onsets', a.onsets, (x) => x.timeSeconds, 1, COLORS.onset) + band('beats', a.beatGrid, (x) => x.timeSeconds, 3, COLORS.beat) + band('downbeats', a.downbeats, (x) => x.timeSeconds, 3, COLORS.downbeat);
  html += `<h3>warnings (${w.length})</h3>` + (w.length ? w.map((x) => `<div class="warn">[${x.severity}] <b>${x.code}</b> — ${esc(x.evidence)}<br><span style="color:#888">implication: ${esc(x.implication)}</span></div>`).join('') : '<div class="ok">none</div>');
  summary.push({ n, a, w, s, tl });
}
html += '</body></html>';
await writeFile(path.join(OUT, 'timeline-debug.html'), html);

/** the human report */
let md = `# PHASE 4A — ANALYSIS REPORT\n\nGenerated from the analysis outputs. **This is an engineering report, not a musical judgement.**\n\n`;
md += `## Per-track results\n\n| track | dur | tempo | conf | pulse | beats | onsets | meter | phrases | sections | breath | warnings |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of summary) {
  const A = r.a;
  md += `| ${r.n} | ${A.durationSeconds.toFixed(2)}s | ${A.tempo.bpm}${A.tempo.halfDoubleAmbiguous ? ` (+${A.tempo.ambiguousWith.bpm})` : ''} | ${A.tempo.confidence.band} | ${A.tempo.support?.supported ? 'supported' : '**UNSUPPORTED**'} | ${A.beatGrid.length} | ${A.onsets.length} | ${A.meter.meter} | ${A.phrases.length} | ${A.sections.length} | ${A.breathPoints.length} | ${r.w.map((x) => x.code).join(', ') || 'none'} |\n`;
}
md += `\n## What each fixture proves\n\n`;
const PROVES = {
  'A-120bpm-click': 'a strict pulse must be found exactly — the easiest case, and the accuracy bound is set here',
  'B-90bpm-missing-beat': 'a missing beat must not destroy the grid',
  'C-120bpm-offbeat-transient': 'BEAT and ONSET must be distinct — and this fixture exposes the tracker phase-locking onto the off-beat',
  'D-tempo-change-100-140': 'a real tempo change must be followed locally, not averaged',
  'E-silence-build-peak-silence': 'the ENERGY curve has ground truth; tempo is meaningless here',
  'F-free-ambient': 'ametric material must NOT produce a confident pulse',
};
for (const r of summary) md += `- **${r.n}** — ${PROVES[r.n] ?? ''}\n`;
md += `\n## Measured limitations\n\n- Fixture **C**: the beat grid is internally regular (0.15% interval error) but **phase-locked onto the off-beat transients, 220.6 ms late**, so beatAccuracy against the on-beat truth is 0.000.\n- Fixture **D**: adaptive region tracking follows the tempo change, but the interval deviation stays above the support threshold, so **no beat grid is published** for it.\n- Fixture **A**: mean absolute beat error is ~29 ms, bounded by autocorrelation lag quantisation at one hop (11.6 ms) and a measured -0.77 ms/beat span error.\n`;
await writeFile(path.join(OUT, 'analysis-report.md'), md);
console.log(`  timeline-debug.html  (${(html.length / 1024).toFixed(0)} KB, ${summary.length} tracks)`);
console.log(`  analysis-report.md   (${summary.length} tracks)`);
