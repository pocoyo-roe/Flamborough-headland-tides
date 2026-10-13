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
- **Time slider**: hours before and after high water at the reference port (HW Hull). Enter today's HW time to see clock times, and press **Now** to jump to the current state of the tide.
- **Spring ↔ neap**: blends between the spring and neap rates in each table.
- **Wind from**: pick a wind direction. The race zone lights up when wind is against tide.
- **Why the tides here are unusual**: six short explainers, each with a **Show me** button that moves the map and clock to the right place and time.

## The data: please read

`data/tidal-diamonds.js` holds the diamond tables. **The values in it now are an illustrative model, not ADMIRALTY data.** ADMIRALTY charts and tidal stream atlases are Crown copyright (UKHO) and their tables can't be republished here. Instead, `tools/build-model-data.mjs` builds tables that fit what the published pilotage notes say about Flamborough Head:

- the south-going stream begins about HW Hull −6 and is strongest about HW Hull −3
- the north-going stream begins about HW Hull +1 and is strongest about HW Hull +3
- the stream reaches about 3 kn off the head at springs, with overfalls in wind against tide

The eddies and the early turn at the head are modelled on standard headland behaviour. Check them against your chart before relying on them.

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

Also set `referencePort` to the port your chart's tables are referenced to (for example `HW Dover` or `HW Immingham`), and change `source` so the warning banner describes the data correctly. The app reads only the tables, and the narrative, eddy highlights and race warning all work from them. Then run the checks:

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
| `data/coastline.js` | Rough land outline that keeps particles off the land |
| `tools/build-model-data.mjs` | Generates the illustrative tables |
| `tools/check-tides.mjs` | Sanity checks for the maths and the tables |
