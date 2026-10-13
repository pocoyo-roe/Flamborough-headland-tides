#!/usr/bin/env node
// Sanity checks for js/tides.js and the diamond tables. Usage: node tools/check-tides.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const T = require('../js/tides.js');
globalThis.window = {};
require('../data/tidal-diamonds.js');
require('../data/coastline.js');
require('../data/local-knowledge.js');
require('../data/local-names.js');
const { TIDAL_DATA: data, LAND_OUTLINE: land, LOCAL_KNOWLEDGE: local, LOCAL_NAMES: names } = globalThis.window;

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// set/rate <-> vector round trip
for (const set of [0, 45, 165, 270, 345]) {
  const v = T.toVector(set, 2);
  const back = T.fromVector(v.u, v.v);
  close(back.rate, 2); close(back.set, set, 1e-6);
}

// a reversing stream passes through slack between hourly rows
const flip = { table: [...Array(13)].map((_, i) => ({ hour: i - 6, set: i < 7 ? 180 : 0, spring: 1, neap: 0.5 })) };
close(T.fromVector(...Object.values(T.diamondVector(flip, 0.5, 1))).rate, 0, 1e-9);
close(T.fromVector(...Object.values(T.diamondVector(flip, 0, 0))).rate, 0.5);

// angles
close(T.angleBetween(350, 10), 20);
close(T.angleBetween(90, 270), 180);

// tables are complete and well-formed
for (const d of data.diamonds) {
  assert.equal(d.table.length, 13, `diamond ${d.id} needs 13 rows`);
  d.table.forEach((r, i) => {
    assert.equal(r.hour, i - 6, `diamond ${d.id} row ${i}`);
    assert.ok(r.set >= 0 && r.set < 360 && r.spring >= r.neap && r.neap >= 0, `diamond ${d.id} row ${i} values`);
  });
  assert.ok(!T.inPolygon(d.lat, d.lon, land), `diamond ${d.id} is on land`);
}

// land mask: Flamborough village is land, the race is sea
assert.ok(T.inPolygon(54.115, -0.12, land));
assert.ok(!T.inPolygon(54.118, -0.04, land));

// local tidal key runs in time order across the whole cycle
const hours = local.key.map((k) => k.hour);
assert.deepEqual(hours, [...hours].sort((a, b) => a - b));
assert.ok(hours[0] === -6 && hours.at(-1) === 6);

// local names sit on the shoreline, within ~300 m of it
const nearCoast = (n) => land.some(([la, lo]) => T.distKm(n.lat, n.lon, la, lo) < 0.3);
for (const n of names) assert.ok(nearCoast(n), `${n.name} is not near the coast`);

console.log(`ok: ${data.diamonds.length} diamonds, ${local.key.length} local key entries, ${names.length} local names checked`);
