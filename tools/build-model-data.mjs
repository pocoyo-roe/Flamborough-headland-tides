#!/usr/bin/env node
// Builds data/tidal-diamonds.js: tidal diamond tables in the same layout as the
// tables printed on ADMIRALTY charts (hours -6..+6 relative to HW at a
// reference port, set in degrees true, spring and neap rates in knots).
//
// The values produced here are an ILLUSTRATIVE MODEL, not copied from a chart.
// They are fitted to two sources that agree with each other:
//
// 1. D. J. Lythgoe's local tidal key for Flamborough Head (see
//    data/local-knowledge.js), timed from HW Bridlington. On this coast the
//    flood runs south and the ebb runs north.
// 2. Published pilotage notes timed from HW Hull: south-going stream from
//    about HW Hull -6 to +1, strongest about HW Hull -3; up to 3 kn off the
//    head at springs. HW Hull is roughly an hour after HW Bridlington, which
//    puts the offshore flood at about HW Bridlington -5 to +2, matching the
//    local key ("slack water in offing" at +2.5).
//
// To use real ADMIRALTY data, edit the `table` arrays in data/tidal-diamonds.js
// directly from your copy of the chart (and set `source` to say so). The app
// only reads the tables, never the model parameters below.
//
// Usage: node tools/build-model-data.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REFERENCE_PORT = 'HW Bridlington';
const NEAP_FACTOR = 0.5; // neap rate / spring rate

// Each diamond lists the phases of its stream through one tidal cycle. A phase
// starts at `start` (hours from HW Bridlington) and lasts until the next
// phase starts. Its rate rises from slack to `rate` at fraction `peak` of the
// way through, then falls back to slack. `local` quotes the tidal key entry
// the phase is fitted to.
const diamonds = [
  {
    id: 'A', name: 'Filey Bay', lat: 54.190, lon: -0.205,
    phases: [
      { start: -5.0, set: 155, rate: 1.0 },
      { start: 2.5, set: 335, rate: 0.9 },
    ],
    note: 'Sheltered bay north of the headland. Weak, regular streams parallel to the shore: flood to the south-east, ebb to the north-west.',
  },
  {
    id: 'B', name: 'Off Bempton Cliffs', lat: 54.165, lon: -0.110,
    phases: [
      { start: -5.25, set: 130, rate: 1.8 },
      { start: 2.25, set: 310, rate: 1.6 },
    ],
    note: 'About a mile off the cliffs, outside the inshore ebb that runs "all up shore to ½ mile off" from HW+2. The stream follows the cliffs and accelerates towards the head.',
  },
  {
    id: 'C', name: 'Off North Landing (inside N. Head)', lat: 54.138, lon: -0.085,
    phases: [
      // the hive arrives at Breil about +3 and Thornwick about +4, then merges
      // into the young flood at low water; the flood is full strength about -2
      { start: 3.5, set: 125, rate: 1.6, peak: 0.72 },
      // "+1 Ebb inside to N. Landing, flood all in offing"
      { start: 0.75, set: 305, rate: 0.9 },
    ],
    note: 'Inside the 10 fathom line on the north side. Here the inshore stream runs south-east towards the head end for most of the tide: the flood, and then the "hive", a flood tide inside while the main ebb runs north offshore. The inshore ebb only runs for about two hours after high water.',
    eddy: 'N',
  },
  {
    id: 'K', name: 'Selwicks Bay (Silex)', lat: 54.1215, lon: -0.0762,
    phases: [
      { start: -6.25, set: 150, rate: 1.8, peak: 0.45 },  // young flood at LW, main flood by -5.5
      { start: 0.5, set: 320, rate: 1.0 },   // ebb inside after HW
      { start: 2.5, set: 145, rate: 0.8 },   // "+2.5 Hive starting in Silex"
      { start: 4.5, set: 330, rate: 0.6, peak: 0.3 },  // "+4.5 Slack in Silex before latter ebb"
    ],
    note: 'Silex is the local name for Selwicks Bay, by the lighthouse. The stream here turns four times a tide: flood, ebb, the hive starting at HW+2½, then a short "latter ebb" from about HW+4½ until the young flood.',
  },
  {
    id: 'D', name: 'Flamborough Head race', lat: 54.118, lon: -0.040,
    phases: [
      { start: -5.5, set: 165, rate: 3.0, peak: 0.48 },  // flood full strength about -2
      { start: 1.75, set: 345, rate: 2.7, peak: 0.58 },  // best of ebb about +5
    ],
    note: 'About 1½ nm east of the head end. The fastest water on this coast: overfalls and a tide race form here, worst with wind against tide. It turns before the offing and after the inshore water.',
  },
  {
    id: 'W', name: 'Whelk Pots', lat: 54.1615, lon: -0.0294,
    phases: [
      { start: -4.75, set: 150, rate: 1.9 },
      { start: 2.25, set: 330, rate: 2.1, peak: 0.32 },  // "+3 Ebb coming in offing (strong at Whelk Pots)"
    ],
    note: 'The fishing grounds about 3 miles off Breil Newk. The ebb comes in strong here soon after it starts in the offing.',
  },
  {
    id: 'E', name: 'Offside, 4 nm E', lat: 54.120, lon: 0.030,
    phases: [
      { start: -4.0, set: 160, rate: 2.0, peak: 0.45 },  // "-4 Ebb easing away offside"
      { start: 2.5, set: 340, rate: 1.8, peak: 0.55 },   // "+2.5 slack water in offing"; best of ebb at LW
    ],
    note: 'The open-sea stream 3–4 miles off the head ("offside"). It turns last: the ebb is still easing away here at HW−4 while the flood is already running well inshore.',
  },
  {
    id: 'F', name: 'Off the head end, by the buoy', lat: 54.092, lon: -0.058,
    phases: [
      { start: -5.5, set: 200, rate: 1.6 },   // "-5.5 No tide at buoy"
      { start: -0.75, set: 35, rate: 1.8, peak: 0.45 },  // "-1 Outset to buoy"
      { start: 5.0, set: 35, rate: 0 },       // "+5 ... eased at buoy"
    ],
    note: 'South-east of the head end, near the buoy the local key refers to. The outset reaches here about an hour before high water, and the ebb has eased here by HW+5.',
  },
  {
    id: 'G', name: 'Off South Landing (inside bay)', lat: 54.0995, lon: -0.115,
    phases: [
      { start: -5.0, set: 235, rate: 0.7, peak: 0.4 },  // "-5 First of flood in Bay"
      { start: -3.0, set: 60, rate: 1.1, peak: 0.45 },  // "-3 Outset Sewerby to S. Landing right inside"
      { start: 5.25, set: 60, rate: 0 },                // "LW No tide inside from Dykes to Cattlemere Hole"
    ],
    note: 'Within ¼ mile of the shore in Bridlington Bay. From HW−3 the "outset" (the ebb running ashore before high water) sets north-east along the shore towards the head end, against the main flood. At low water there is no tide here at all.',
    eddy: 'S',
  },
  {
    id: 'H', name: 'Smithic Sands', lat: 54.068, lon: -0.150,
    phases: [
      { start: -5.0, set: 205, rate: 0.7 },
      { start: -2.25, set: 35, rate: 0.7 },   // "-2 Outset Bridlington to Head End"
      { start: 4.75, set: 35, rate: 0 },
    ],
    note: 'Shallow bank in Bridlington Bay. Weak streams: a short flood, then the outset running towards the head from about HW−2, then slack around low water.',
  },
  {
    id: 'J', name: 'Bridlington Bay approach', lat: 54.045, lon: -0.075,
    phases: [
      { start: -5.0, set: 185, rate: 1.4 },
      { start: 0.5, set: 5, rate: 1.3 },
    ],
    note: 'Outer bay, beyond the buoy. Streams follow the Holderness coast.',
  },
];

const PERIOD = 12.42; // semidiurnal (M2) period, hours

function streamAt(d, h) {
  const phases = [...d.phases].sort((a, b) => a.start - b.start);
  const wrap = (x) => ((x % PERIOD) + PERIOD) % PERIOD;
  // Find the phase that started most recently before h.
  let best = null, since = Infinity;
  for (const p of phases) {
    const s = wrap(h - p.start);
    if (s < since) { since = s; best = p; }
  }
  const i = phases.indexOf(best);
  const next = phases[(i + 1) % phases.length];
  const len = wrap(next.start - best.start) || PERIOD;
  const f = since / len;
  const pk = best.peak ?? 0.5;
  const shape = f < pk ? Math.sin((Math.PI / 2) * (f / pk)) : Math.cos((Math.PI / 2) * ((f - pk) / (1 - pk)));
  return { set: best.set, rate: best.rate * shape };
}

const round1 = (x) => Math.round(x * 10) / 10;

const out = {
  source: "ILLUSTRATIVE MODEL fitted to D. J. Lythgoe's local tidal key and published pilotage notes. NOT ADMIRALTY data. Not for navigation.",
  referencePort: REFERENCE_PORT,
  // Bridlington tidal levels, metres above chart datum (Visit My Harbour).
  levels: { MHWS: 6.1, MHWN: 4.7, MLWN: 2.3, MLWS: 1.1 },
  generated: 'tools/build-model-data.mjs',
  diamonds: diamonds.map((d) => ({
    id: d.id,
    name: d.name,
    lat: d.lat,
    lon: d.lon,
    note: d.note,
    eddy: d.eddy || null,
    // One row per hour, -6..+6, matching an ADMIRALTY tidal diamond table.
    table: Array.from({ length: 13 }, (_, i) => {
      const h = i - 6;
      const { set, rate } = streamAt(d, h);
      return { hour: h, set, spring: round1(rate), neap: round1(rate * NEAP_FACTOR) };
    }),
  })),
};

const header = `// Tidal diamond tables for Flamborough Head.\n` +
  `// Generated by tools/build-model-data.mjs. Replace the tables with values\n` +
  `// from your ADMIRALTY chart to use real data (see README.md).\n`;
const target = fileURLToPath(new URL('../data/tidal-diamonds.js', import.meta.url));
writeFileSync(target, `${header}window.TIDAL_DATA = ${JSON.stringify(out, null, 2)};\n`);
console.log(`wrote ${target}`);
