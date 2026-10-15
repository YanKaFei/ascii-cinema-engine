/** PHASE 4A.2 — timeline-debug.html for the real track. Engineering diagnostic, not production UI. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const RT = path.join(ROOT, 'out', 'phase4a1', 'real-track');
const a = JSON.parse(await readFile(path.join(RT, 'music-analysis.json'), 'utf8'));
const w = JSON.parse(await readFile(path.join(RT, 'analysis-warnings.json'), 'utf8'));
const r = JSON.parse(await readFile(path.join(RT, 'sync-readiness.json'), 'utf8'));
const sm = JSON.parse(await readFile(path.join(RT, 'future-sync-map.json'), 'utf8'));
const W = 1600, ROW = 30;
const dur = a.durationSeconds;
const X = (t) => Math.round((t / dur) * (W - 40)) + 20;
const C = { beat: '#2b8a3e', onset: '#1c7ed6', phrase: '#7048e8', section: '#c2255c', silence: '#868e96', breath: '#f59f00', energy: '#fa5252', warn: '#f59f00' };
const band = (label, items, get, width, color) => `<div class="row"><span class="lbl">${label} <b>${items.length}</b></span>` + items.map((x) => { const p = get(x); return p === undefined ? '' : `<div class="m" style="left:${X(p)}px;width:${width}px;background:${color}"></div>`; }).join('') + '</div>';
const minDb = Math.min(...a.energyCurve.map((x) => x.rmsDb)), maxDb = Math.max(...a.energyCurve.map((x) => x.rmsDb));
const pts = a.energyCurve.map((x) => `${X(x.timeSeconds)},${ROW - 3 - ((x.rmsDb - minDb) / Math.max(1e-9, maxDb - minDb)) * (ROW - 6)}`).join(' ');
let h = `<!doctype html><html><head><meta charset="utf-8"><title>4A.2 real track</title><style>
body{background:#111;color:#ddd;font:13px ui-monospace,monospace;margin:0;padding:20px}h1{font-size:17px}h2{font-size:14px;margin:22px 0 6px;color:#fff}
.row{position:relative;height:${ROW}px;background:#1a1a1a;margin:2px 0;overflow:hidden}.lbl{position:absolute;left:4px;top:8px;font-size:10px;color:#999;z-index:9;background:#1a1a1acc;padding:0 3px}
.m{position:absolute;top:0;bottom:0}.warn{font-size:12px;margin:3px 0}table{border-collapse:collapse;margin:6px 0}td,th{border:1px solid #333;padding:3px 8px;font-size:12px;text-align:left}
.bad{color:#fa5252}.good{color:#2b8a3e}.unc{color:#f59f00}</style></head><body>
<h1>PHASE 4A.2 — REAL TRACK TIMELINE (engineering diagnostic)</h1>
<div style="font-size:12px;color:#aaa">${a.durationSeconds.toFixed(2)}s · 48000 Hz · mono analysis · ${a.onsets.length} onsets · ${a.sections.length} sections · ${a.phrases.length} phrases</div>
<h2>status</h2>
<table>
<tr><th>tempo</th><td>${a.tempo.bpm} BPM (${a.tempo.confidence.band}) — half/double ambiguous: <b>${a.tempo.halfDoubleAmbiguous}</b></td></tr>
<tr><th>candidates</th><td>${a.tempo.candidates.map((c) => c.bpm).join(', ')}</td></tr>
<tr><th>pulse support</th><td class="bad">UNSUPPORTED — strength contrast ${a.tempo.support.strengthContrast} (needs &ge; 1.25)</td></tr>
<tr><th>beat grid</th><td class="bad">WITHHELD — 0 beats published</td></tr>
<tr><th>phase search</th><td class="unc">EXPLORATORY: ${a.metroGrid.length} beats at ${a.beatPhaseCandidates[0].tempoCandidateBpm} BPM — bypassed the support gate, NOT published</td></tr>
<tr><th>phase separation</th><td>${a.phaseSupportCurve.separation} (ambiguous: ${a.phaseSupportCurve.ambiguous})</td></tr>
<tr><th>meter / downbeat</th><td>${a.meter.meter} / ${a.downbeatStatus}</td></tr>
<tr><th>readiness</th><td class="bad">${r.overall}</td></tr>
<tr><th>C-class</th><td class="bad">PRESENT — unsupported pulse</td></tr>
<tr><th>D-class</th><td class="unc">UNCERTAIN — no local tempo curve exists, so the check could not be performed</td></tr>
</table>`;
h += `<h2>layers</h2>`;
h += band('sections', a.sections, (x) => x.startSeconds, 4, C.section);
h += band('phrases', a.phrases, (x) => x.startSeconds, 2, C.phrase);
h += `<div class="row"><span class="lbl">energy RMS dB</span><svg width="${W}" height="${ROW}" style="position:absolute;left:0;top:0"><polyline points="${pts}" fill="none" stroke="${C.energy}" stroke-width="1"/></svg></div>`;
h += band('silence', a.silenceRegions, (x) => x.startSeconds, 3, C.silence);
h += band('breath', a.breathPoints, (x) => x.timeSeconds, 8, C.breath);
h += band('onsets', a.onsets, (x) => x.timeSeconds, 1, C.onset);
h += band('beats (published)', a.beatGrid, (x) => x.timeSeconds, 3, C.beat);
h += band('phase-search grid (EXPLORATORY)', a.metroGrid, (x) => x.timeSeconds, 2, '#555');
h += `<h2>sections — measured evidence</h2><table><tr><th>label</th><th>span</th><th>mean RMS</th><th>evidence</th></tr>`;
for (const s of a.sections) h += `<tr><td>${s.label}</td><td>${s.startSeconds}–${s.endSeconds}s</td><td>${s.meanRmsDb} dB</td><td>${s.evidence.join('; ')}</td></tr>`;
h += `</table><h2>regional readiness</h2>`;
if (!r.regions.length) h += `<div class="bad">NO REGIONS COULD BE ASSESSED — no beat grid was published, so there is no phase evidence. A verdict of ready cannot be derived from the absence of evidence.</div>`;
else { h += `<table><tr><th>region</th><th>span</th><th>kind</th><th>readiness</th><th>evidence</th></tr>`; for (const x of r.regions) h += `<tr><td>${x.index}</td><td>${x.startSeconds}–${x.endSeconds}s</td><td>${x.kind}</td><td>${x.readiness}</td><td>${x.evidence.join('; ')}</td></tr>`; h += `</table>`; }
h += `<h2>future sync map</h2><div style="font-size:11px;color:#888">${sm.note}</div>`;
if (!sm.regions.length) h += `<div class="unc">no regions — see above</div>`;
else { h += `<table><tr><th>region</th><th>available evidence</th><th>allowed</th><th>prohibited</th><th>reason</th></tr>`; for (const x of sm.regions) h += `<tr><td>${x.region}</td><td>${x.availableEvidence.join(', ') || '—'}</td><td class="good">${x.allowedSyncModes.join(', ')}</td><td class="bad">${x.prohibited.join(', ')}</td><td>${x.reason}</td></tr>`; h += `</table>`; }
h += `<h2>warnings (${w.length})</h2>` + w.map((x) => `<div class="warn">[${x.severity}] <b>${x.code}</b> — ${x.evidence}<br><span style="color:#888">implication: ${x.implication}</span></div>`).join('');
h += `</body></html>`;
await writeFile(path.join(RT, 'timeline-debug.html'), h);
console.log(`  timeline-debug.html written (${(h.length / 1024).toFixed(0)} KB)`);
