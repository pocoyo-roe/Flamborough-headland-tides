#!/usr/bin/env node
// Builds data/tidal-diamonds.js: tidal diamond tables in the same layout as the
// tables printed on ADMIRALTY charts (hours -6..+6 relative to HW at a
// reference port, set in degrees true, spring and neap rates in knots).
//
// The values produced here are an ILLUSTRATIVE MODEL, not copied from a chart.
// They are fitted to published pilotage notes for Flamborough Head:
//   - south-going stream begins about HW Hull -6, strongest about HW Hull -3
//   - north-going stream begins about HW Hull +1, strongest about HW Hull +3
//   - the stream accelerates round the head, up to about 3 kn at springs
// The eddies either side of the head are modelled on standard headland
// behaviour (lee-side return flow towards the tip).
//
// To use real ADMIRALTY data, edit the `table` arrays in data/tidal-diamonds.js
// directly from your copy of the chart (and set `source` to say so). The app
// only reads the tables, never the model parameters below.
//
// Usage: node tools/build-model-data.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REFERENCE_PORT = 'HW Hull (Albert Dock)';
const NEAP_FACTOR = 0.5; // neap rate / spring rate

// Each diamond has a south-going (S) phase and a north-going (N) phase, named
// after the offshore stream. `start` is when that phase begins, in hours
// relative to HW Hull; the S phase runs until the N phase starts and vice versa.
const diamonds = [
  {
    id: 'A', name: 'Filey Bay', lat: 54.190, lon: -0.205,
    S: { start: -5.75, set: 155, rate: 1.0 },
    N: { start: 1.25, set: 335, rate: 0.9 },
    note: 'Sheltered bay north of the headland. Weak, regular streams parallel to the shore.',
  },
  {
    id: 'B', name: 'Off Bempton Cliffs', lat: 54.165, lon: -0.110,
    S: { start: -6.0, set: 130, rate: 1.8 },
    N: { start: 1.0, set: 310, rate: 1.6 },
    note: 'Streams follow the line of the cliffs and begin to accelerate towards the head.',
  },
  {
    id: 'C', name: 'Off North Landing (inshore)', lat: 54.138, lon: -0.085,
    S: { start: -6.5, set: 125, rate: 1.4 },
    N: { start: 0.5, set: 120, rate: 0.6 },
    note: 'Inshore on the north side. While the main stream runs north, a lee eddy keeps the inshore water running back south-east towards the head, so the set here hardly reverses.',
    eddy: 'N',
  },
  {
    id: 'D', name: 'Flamborough Head race', lat: 54.118, lon: -0.040,
    S: { start: -6.5, set: 165, rate: 3.0 },
    N: { start: 0.5, set: 345, rate: 2.7 },
    note: 'About 1.5 nm east of the head. The fastest water on this coast; overfalls and a tide race form here, worst with wind against tide. Turns about 30 min before the offshore stream.',
  },
  {
    id: 'E', name: 'Offshore, 4 nm E', lat: 54.120, lon: 0.030,
    S: { start: -6.0, set: 160, rate: 2.0 },
    N: { start: 1.0, set: 340, rate: 1.8 },
    note: 'Open-sea stream, little affected by the headland. Useful as a reference for the general North Sea flow.',
  },
  {
    id: 'F', name: 'SE of the head', lat: 54.088, lon: -0.055,
    S: { start: -6.25, set: 195, rate: 2.2 },
    N: { start: 0.75, set: 20, rate: 2.0 },
    note: 'Where the stream that has rounded the head fans out across the mouth of Bridlington Bay.',
  },
  {
    id: 'G', name: 'Off South Landing (inshore)', lat: 54.098, lon: -0.115,
    S: { start: -6.5, set: 60, rate: 0.6 },
    N: { start: 0.5, set: 75, rate: 1.2 },
    note: 'Inshore on the south side. While the main stream runs south, the head shelters this water and a clockwise eddy sends it back north-east towards the head. When the main stream runs north it also sets east along this shore, so the set here is easterly almost all the time.',
    eddy: 'S',
  },
  {
    id: 'H', name: 'Smithic Sands', lat: 54.068, lon: -0.150,
    S: { start: -5.5, set: 200, rate: 0.7 },
    N: { start: 1.5, set: 15, rate: 0.6 },
    note: 'Shallow bank in Bridlington Bay. Weak streams in the shelter of the head, turning later than outside.',
  },
  {
    id: 'J', name: 'Bridlington Bay approach', lat: 54.045, lon: -0.075,
    S: { start: -6.0, set: 185, rate: 1.4 },
    N: { start: 1.0, set: 5, rate: 1.3 },
    note: 'Outer bay. Streams follow the Holderness coast to the south.',
  },
];

const PERIOD = 12.42; // semidiurnal (M2) period, hours

function streamAt(d, h) {
  // Work out which phase h falls in and how far through it we are.
  const sLen = (d.N.start - d.S.start + PERIOD) % PERIOD;
  const nLen = PERIOD - sLen;
  const sinceS = (((h - d.S.start) % PERIOD) + PERIOD) % PERIOD;
  const [phase, frac] = sinceS < sLen ? [d.S, sinceS / sLen] : [d.N, (sinceS - sLen) / nLen];
  return { set: phase.set, rate: phase.rate * Math.sin(Math.PI * frac) };
}

const round1 = (x) => Math.round(x * 10) / 10;

const out = {
  source: 'ILLUSTRATIVE MODEL fitted to published pilotage notes. NOT ADMIRALTY data. Not for navigation.',
  referencePort: REFERENCE_PORT,
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
