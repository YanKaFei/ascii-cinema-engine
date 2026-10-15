/**
 * §6/§7 MUSIC WINDOW SELECTION.
 *
 * ⚠ **The film imposes its own internal landmarks at fixed fractions of the 16 s.** A window is therefore judged
 * by whether the music's OWN contour supports that shape — not by loudness, and not by boundary convenience
 * alone. §6 explicitly forbids defaulting to the loudest or the opening 16 s.
 *
 * The film's internal fractions (from film-dramaturgy.json, 480 frames):
 *   notice readable      3.233 s  = 0.202
 *   step begins          4.633 s  = 0.290
 *   reach readable       8.167 s  = 0.510
 *   NAME fragments       8.200 s  = 0.513
 *   ROOM decays         12.133 s  = 0.758
 *   final hold          15.967 s  = 0.998
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4b0');
await mkdir(OUT, { recursive: true });
const a = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/music-analysis.json'), 'utf8'));
const dur = a.durationSeconds, WIN = 16;
const ec = a.energyCurve;
const at = (t) => { let b = ec[0], bd = Infinity; for (const s of ec) { const d = Math.abs(s.timeSeconds - t); if (d < bd) { bd = d; b = s; } } return b; };
/** mean RMS dB over a span, sampled from the continuous curve */
const meanDb = (s, e) => { const xs = ec.filter((x) => x.timeSeconds >= s && x.timeSeconds < e); return xs.length ? xs.reduce((t, x) => t + x.rmsDb, 0) / xs.length : -99; };
const onsetsIn = (s, e) => a.onsets.filter((o) => o.timeSeconds >= s && o.timeSeconds < e).length;

/** the film's dramaturgical fractions, READ from the landmark file */
const filmDr = JSON.parse(await readFile(path.join(OUT, 'film-dramaturgy.json'), 'utf8'));
const ev = Object.fromEntries(filmDr.events.map((e) => [e.eventId, e]));
const F = (id) => ev[id].timeSeconds / dur === undefined ? 0 : ev[id].timeSeconds / WIN;  // fraction of the FILM window
const FRAC = { notice: F('notice_readable'), step: F('step'), reach: F('reach_readable'), fragment: F('name_fragment_onset'), room: F('room_decay_onset'), hold: F('final_hold') };

console.log('§6 MUSIC WINDOW SELECTION\n');
console.log(`  film ${WIN} s, music ${dur} s -> ${dur - WIN + 1} possible start seconds (only integer-ish steps scanned at 0.25 s)`);
console.log(`  film internal fractions: notice ${FRAC.notice.toFixed(3)}  step ${FRAC.step.toFixed(3)}  reach ${FRAC.reach.toFixed(3)}  fragment ${FRAC.fragment.toFixed(3)}  room ${FRAC.room.toFixed(3)}  hold ${FRAC.hold.toFixed(3)}\n`);

/** contour descriptors, all measured */
const scan = [];
for (let s = 0; s <= dur - WIN + 1e-9; s += 0.25) {
  const e = s + WIN;
  const q = (id) => meanDb(s + FRAC[id] * WIN - 0.4, s + FRAC[id] * WIN + 0.4);
  const qBefore = (id, w) => meanDb(s + FRAC[id] * WIN - w, s + FRAC[id] * WIN);
  const qAfter = (id, w) => meanDb(s + FRAC[id] * WIN, s + FRAC[id] * WIN + w);
  const dbs = [];
  for (let k = 0; k < 16; k++) dbs.push(meanDb(s + k, s + k + 1));
  const mean = dbs.reduce((x, y) => x + y, 0) / dbs.length;
  const slope = dbs[15] - dbs[0];
  const spread = Math.max(...dbs) - Math.min(...dbs);
  /** the film's SHAPE: quiet at establishment, build to the fragment, a pre-room valley, space at the end */
  const establishmentDb = meanDb(s, s + 0.1 * WIN);
  const fragmentDb = q('fragment');
  const roomDb = q('room');
  const holdDb = meanDb(s + 0.9 * WIN, e);
  const buildToFragment = fragmentDb - establishmentDb;
  const retreatFromFragment = fragmentDb - roomDb;
  const releaseAtEnd = roomDb - holdDb;
  /** boundary quality, measured against the music's own section and phrase boundaries */
  const nearBoundary = (t) => a.sections.some((x) => Math.abs(x.startSeconds - t) < 0.4) || a.phrases.some((p) => Math.abs(p.startSeconds - t) < 0.4);
  const silenceAtStart = a.silenceRegions.some((r) => Math.abs(r.startSeconds - s) < 0.3);
  const silenceAtEnd = a.silenceRegions.some((r) => Math.abs(r.endSeconds - e) < 0.3);
  scan.push({ startSeconds: +s.toFixed(3), endSeconds: +e.toFixed(3), meanDb: +mean.toFixed(2), slopeDbAcrossWindow: +slope.toFixed(2), spreadDb: +spread.toFixed(2),
    establishmentDb: +establishmentDb.toFixed(2), fragmentDb: +fragmentDb.toFixed(2), roomDb: +roomDb.toFixed(2), holdDb: +holdDb.toFixed(2),
    buildToFragmentDb: +buildToFragment.toFixed(2), retreatAfterFragmentDb: +retreatFromFragment.toFixed(2), releaseAtEndDb: +releaseAtEnd.toFixed(2),
    onsets: onsetsIn(s, e), startsOnMusicalBoundary: nearBoundary(s), endsOnMusicalBoundary: nearBoundary(e), startsInSilence: silenceAtStart, endsInSilence: silenceAtEnd });
}
/** ⚠ THREE CONTOUR CLASSES, distinguished by MEASURED shape, not by loudness */
const byShape = {
  RESTRAINED_ATMOSPHERIC: scan.filter((w) => w.spreadDb <= 8 && w.onsets <= 90 && w.meanDb <= -12),
  PROGRESSIVE_BUILD: scan.filter((w) => w.buildToFragmentDb >= 3 && w.slopeDbAcrossWindow >= 1.5),
  CONTRAST_RELEASE: scan.filter((w) => w.retreatAfterFragmentDb >= 4 || w.releaseAtEndDb >= 4),
};
for (const [k, v] of Object.entries(byShape)) console.log(`  ${k.padEnd(24)} ${v.length} windows satisfy the measured criterion`);
console.log('');
/** pick, per class, the window with the best BOUNDARY quality, then the best contour — and record the ordering */
const score = (w) => (w.startsOnMusicalBoundary ? 2 : 0) + (w.endsOnMusicalBoundary ? 2 : 0) + (w.startsInSilence ? 3 : 0) + (w.endsInSilence ? 3 : 0);
const candidates = [];
const chosen = new Set();
for (const [cls, pool] of Object.entries(byShape)) {
  const sorted = [...pool].sort((x, y) => (score(y) - score(x)) || (Math.abs(x.slopeDbAcrossWindow) - Math.abs(y.slopeDbAcrossWindow)));
  const pick = sorted.find((w) => !chosen.has(w.startSeconds));
  if (!pick) { console.log(`  ${cls}: NO USABLE WINDOW — reported rather than forced`); continue; }
  chosen.add(pick.startSeconds);
  candidates.push({ className: cls, ...pick, boundaryScore: score(pick),
    boundaryNarrative: [pick.startsInSilence ? 'begins inside a silence region' : pick.startsOnMusicalBoundary ? 'begins at a detected section or phrase boundary' : 'begins mid-phrase (no detected boundary)',
      pick.endsInSilence ? 'ends inside a silence region' : pick.endsOnMusicalBoundary ? 'ends at a detected section or phrase boundary' : 'ends mid-phrase (no detected boundary)'].join('; ') });
}
console.log('  ⚠ CANDIDATES CHOSEN BY CONTOUR CLASS + BOUNDARY QUALITY, NOT BY LOUDNESS:');
for (const c of candidates) console.log(`    ${c.className.padEnd(24)} ${c.startSeconds}..${c.endSeconds}s  mean ${c.meanDb} dB  build ${c.buildToFragmentDb} retreat ${c.retreatAfterFragmentDb} release ${c.releaseAtEndDb}  onsets ${c.onsets}  boundaryScore ${c.boundaryScore}\n      ${c.boundaryNarrative}`);
const loudest = scan.reduce((x, y) => (y.meanDb > x.meanDb ? y : x), scan[0]);
const opening = scan[0];
console.log(`\n  FOR THE RECORD (the two windows §6 forbids defaulting to):`);
console.log(`    loudest 16 s : ${loudest.startSeconds}..${loudest.endSeconds}s at ${loudest.meanDb} dB`);
console.log(`    opening 16 s : ${opening.startSeconds}..${opening.endSeconds}s at ${opening.meanDb} dB`);
console.log(`    chosen windows: ${candidates.map((c) => c.startSeconds).join(', ')} — ${candidates.some((c) => c.startSeconds === loudest.startSeconds) ? 'INCLUDES the loudest' : 'does NOT include the loudest'}`);
await writeFile(path.join(OUT, 'music-window-candidates.json'), JSON.stringify({
  note: 'Up to three CONTIGUOUS 16 s windows chosen for distinct MEASURED dramaturgical contours and boundary quality. No rearrangement, no looping, no stretching.',
  filmWindowSeconds: WIN, musicDurationSeconds: dur,
  filmInternalFractions: FRAC,
  selectionCriteria: {
    RESTRAINED_ATMOSPHERIC: 'spreadDb <= 8 AND onsets <= 90 AND meanDb <= -12',
    PROGRESSIVE_BUILD: 'buildToFragmentDb >= 3 AND slopeDbAcrossWindow >= 1.5',
    CONTRAST_RELEASE: 'retreatAfterFragmentDb >= 4 OR releaseAtEndDb >= 4',
    tieBreak: 'boundary score (starts/ends in silence 3, at a detected boundary 2), then flattest slope',
    forbiddenDefaults: ['the loudest 16 s', 'the opening 16 s'],
  },
  candidates,
  forbiddenDefaultsMeasured: { loudestWindow: { startSeconds: loudest.startSeconds, meanDb: loudest.meanDb }, openingWindow: { startSeconds: opening.startSeconds, meanDb: opening.meanDb } },
  scannedWindowCount: scan.length,
}, null, 2));
await writeFile(path.join(OUT, 'music-window-evidence.json'), JSON.stringify({
  note: 'Every scanned start second with its measured contour, so the selection can be audited and reproduced.',
  metricDefinitions: {
    meanDb: 'mean RMS dB over the window, from the continuous energy curve',
    slopeDbAcrossWindow: 'mean dB of the last second minus the first second',
    spreadDb: 'max minus min of the 16 per-second mean dB values',
    buildToFragmentDb: 'mean dB around the film\'s fragmentation instant minus mean dB at establishment',
    retreatAfterFragmentDb: 'mean dB at fragmentation minus mean dB at the room-decay instant',
    releaseAtEndDb: 'mean dB at the room-decay instant minus mean dB over the final 10% of the window',
    onsets: 'detected onsets inside the window',
  },
  scan,
}, null, 2));
console.log(`\n  music-window-candidates.json + music-window-evidence.json written (${scan.length} windows scanned)`);
