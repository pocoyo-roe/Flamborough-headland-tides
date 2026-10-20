# Flamborough Head tides

An interactive map of the tidal streams around Flamborough Head on the Yorkshire coast. It shows how the North Sea stream speeds up into a tide race off the point, turns early close to the head, and curls into eddies in Bridlington Bay and off North Landing.

**Not for navigation.** Always use an up-to-date official chart and tidal stream atlas.

## Running it

It's a static page with no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

It also works as a GitHub Pages site: Settings → Pages → deploy from the branch root.

### Single-file version

`node tools/build-artifact.mjs` bundles everything into `dist/flamborough-tides.html`, one self-contained page for hosts that can't load map tiles, such as a claude.ai artifact. It loads Leaflet from cdnjs and draws the base map in chart style from `data/coastline.js` instead of using OpenStreetMap tiles. Rebuild it after changing the data or code.

The base map comes from OpenStreetMap and the seamarks overlay from OpenSeaMap, so you need to be online to see the map tiles. Leaflet is vendored in `vendor/leaflet`.

## What it shows

- **Magenta diamonds**: tidal diamonds laid out like the ones on ADMIRALTY charts. The arrow shows the current set and rate. Tap a diamond to see its full table and its rate curve over the tidal cycle.
- **Moving streaks**: the stream between diamonds, blended by inverse-distance weighting. Darker, faster streaks mean faster water.
- **Time slider**: hours before and after high water at Bridlington. Enter today's HW Bridlington time to see clock times, and press **Now** to jump to the current state of the tide. Enter the HW height to set springs or neaps automatically.
- **Local tidal key**: the matching line from Lythgoe's key for the time on the slider. Zoom in to see the local names round the headland.
- **Spring ↔ neap**: blends between the spring and neap rates in each table.
- **Wind from**: pick a wind direction. The race zone lights up when wind is against tide.
- **Why the tides here are unusual**: six short explainers, each with a **Show me** button that moves the map and clock to the right place and time.

## Tide times

`data/tides.json` holds a week of modelled sea level for Bridlington from the free [Open-Meteo](https://open-meteo.com) marine API (CC BY 4.0), with the high and low waters found in it. The map loads it on open: it jumps to the current state of the tide, sets **HW Bridlington** from the nearest forecast high water, and sets springs or neaps from that tide's range against Bridlington's mean ranges (5.0 m springs, 2.4 m neaps). The week's high waters are listed in the panel; pick one to move the clock to it.

It is a model, not the ADMIRALTY predictions: times can be 20–30 minutes and heights 0.2–0.3 m out, and heights are above mean sea level rather than chart datum. Refresh it with:

```sh
python3 tools/refresh_tides.py      # writes data/tides.json
node tools/build-artifact.mjs       # copies it to dist/tides.json, next to the page
```

and republish. When the forecast runs out the page says so, and you can still type in a high water time by hand.

### Official ADMIRALTY times (GitHub Pages version)

With an ADMIRALTY UK Tidal API key, the GitHub Pages version of the map can show the official UKHO predictions for Bridlington instead of the Open-Meteo model. The free Discovery subscription doesn't allow storing or caching predictions, so the map fetches them live each time it opens, through a small relay that keeps the key secret:

1. In Cloudflare (a free account is enough), go to **Workers & Pages → Create → Worker**, paste `worker/admiralty-relay.js` and deploy.
2. In the worker's **Settings → Variables and secrets**, add a **Secret** named `ADMIRALTY_API_KEY` with your primary key.
3. Put the worker's address plus `/tides` into `js/config.js` as `liveTidesUrl`, for example `https://flamborough-tides.yourname.workers.dev/tides`.
4. Turn on GitHub Pages for the repository. The relay only answers requests from `https://pocoyo-roe.github.io`; set an `ALLOWED_ORIGIN` variable on the worker if the site lives elsewhere.

If the relay is unreachable, the map falls back to the Open-Meteo forecast. The claude.ai artifact can't reach outside services, so it always uses Open-Meteo.

## The data: please read

`data/tidal-diamonds.js` holds the diamond tables, timed from **HW Bridlington**. **The values in it are an illustrative model, not ADMIRALTY data.** ADMIRALTY charts and tidal stream atlases are Crown copyright (UKHO), and their tables can't be republished here. Instead, `tools/build-model-data.mjs` builds tables fitted to two sources that agree with each other:

- **D. J. Lythgoe's local tidal key** (`data/local-knowledge.js`), transcribed from his hand-drawn map of the headland. It uses local terms: the *hive* (flood tide inside at North Head during the ebb), the *outset* (ebb tide ashore before high water), *Silex* (Selwicks Bay), the *offing* (about 3 miles off) and the *Whelk Pots* (3 miles off Breil Newk). On this coast the flood runs south and the ebb runs north.
- **Published pilotage notes**, timed from HW Hull: south-going stream from about HW Hull −6 to +1, strongest about −3, and about 3 kn off the head at springs. With HW Hull about an hour after HW Bridlington, this matches the local key's offshore flood from about HW Bridlington −5 to slack in the offing at +2½.

Bridlington tidal levels (MHWS 6.1 m, MHWN 4.7 m, MLWN 2.3 m, MLWS 1.1 m, from Visit My Harbour) turn a high-water height from the tide table into a spring/neap blend, and give a rough height of tide.

## Geography

- **Coastline, stacks and drying ground** (`data/coastline.js`, `data/intertidal.js`): from OpenStreetMap (© OpenStreetMap contributors, ODbL). The coastline is OSM's `natural=coastline`, the mean high water line, traced from aerial imagery to roughly 5–10 m. The drying ground is the rock scars (West Scar, East Scar, Panniman Scars and others OSM has) and the sand that is covered at high water, shown in chart green. Cliff lines are dotted.
  - `.github/workflows/fetch-osm.yml` downloads the data from Overpass into `data/osm/flamborough.json`. Run it from the repository's Actions tab when OSM has improved.
  - `python3 tools/build_osm_geography.py` then rebuilds the map files from that download. The query itself is in `tools/osm-query.overpassql`.
  - OSM only has the scars someone has mapped. Most of the headland's scars aren't in it yet; adding them to OpenStreetMap and re-running the workflow brings them into the map.
- **Local names** (`data/local-names.js`): 83 names of coves, rocks and cliffs from Lythgoe's map. That map isn't to scale, so each name keeps its order and spacing along the coast and is pinned to the real shoreline between control points: Thornwick Bay, North Landing, Selwicks Bay, the head end and South Landing, plus every name OSM also has (West Scar, East Scar, Horse Hole, Robin Lythes Hole, Panniman Scars). Names between control points can still be out by tens of metres.
- `tools/build_geography.py` is the older GSHHG-based builder, kept as a fallback if the OSM download is unavailable.

### Using your own ADMIRALTY chart data

The covering charts are BA 129 (Whitby to Flamborough Head) and BA 121 (Flamborough Head to Withernsea). Copy the tables you're licensed to use into `data/tidal-diamonds.js`:

```js
{
  "id": "D",                       // the diamond's letter on the chart
  "name": "Flamborough Head race",
  "lat": 54.118, "lon": -0.040,    // decimal degrees, west negative
  "note": "Shown in the side panel.",
  "eddy": null,                    // "S" or "N" if this inshore diamond marks an eddy
  "table": [                       // 13 rows, hours -6..+6 from HW at the reference port
    { "hour": -6, "set": 165, "spring": 0.7, "neap": 0.3 },
    ...
  ]
}
```

Also set `referencePort` to the port your chart's tables are referenced to if it isn't Bridlington (for example `HW Dover` or `HW River Tees`), and change `source` so the warning banner describes the data correctly. The app reads only the tables, and the narrative, eddy highlights and race warning all work from them. Then run the checks:

```sh
node tools/check-tides.mjs
```

If you edit the model instead, regenerate the data with `node tools/build-model-data.mjs`. That overwrites `data/tidal-diamonds.js`.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page and styles (light and dark) |
| `js/tides.js` | Tidal stream maths: time and space interpolation, vectors. No DOM, so Node can run it |
| `js/app.js` | Map, particle animation, panel, chart |
| `data/tidal-diamonds.js` | Diamond tables (illustrative model, see above) |
| `data/coastline.js` | OSM coastline and stacks for the drawn chart and the particle land mask |
| `data/intertidal.js` | OSM rock scars, drying sand and cliff lines |
| `data/osm/flamborough.json` | Raw OSM download (from the Fetch OpenStreetMap coastline workflow) |
| `tools/build_osm_geography.py` | Builds the coastline, drying ground and name positions from the OSM download |
| `data/local-knowledge.js` | Lythgoe's local tidal key and glossary |
| `data/local-names.js` | Local names round the headland, placed on the coastline |
| `tools/build_geography.py` | Builds the coastline and places the local names |
| `data/tides.json` | A week of Open-Meteo sea level and high/low waters for Bridlington |
| `tools/refresh_tides.py` | Fetches `data/tides.json` |
| `worker/admiralty-relay.js` | Cloudflare Worker that relays live ADMIRALTY predictions without storing them |
| `js/config.js` | Site settings: the relay address for live ADMIRALTY times |
| `tools/build-model-data.mjs` | Generates the illustrative tables |
| `tools/check-tides.mjs` | Sanity checks for the maths and the tables |
