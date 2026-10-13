#!/usr/bin/env node
// Bundles the app into one self-contained HTML file (dist/flamborough-tides.html)
// for hosts that only accept a single page and block map tile servers, such as
// claude.ai artifacts. Leaflet loads from cdnjs; everything else is inlined and
// the base map is drawn from data/coastline.js instead of web tiles.
//
// Usage: node tools/build-artifact.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

const index = read('index.html');
const title = index.match(/<title>.*<\/title>/)[0];
const fonts = index.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const body = index.slice(index.indexOf('<body>') + 6, index.indexOf('<script')).trim();
const script = (src) => `<script>\n${read(src)}\n</script>`;

const html = `${title}
${fonts}
<style>
${read('vendor/leaflet/leaflet.css')}
</style>
<style>
${read('css/style.css')}
</style>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.FLAM_CONFIG = { tiles: false };</script>
${script('data/tidal-diamonds.js')}
${script('data/coastline.js')}
${script('data/local-knowledge.js')}
${script('data/local-names.js')}
${script('js/tides.js')}
${script('js/app.js')}
`;

mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/flamborough-tides.html', html);
console.log(`wrote dist/flamborough-tides.html (${(html.length / 1024).toFixed(0)} KB)`);
