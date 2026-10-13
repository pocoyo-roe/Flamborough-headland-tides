/* OpenStreetMap features for the Flamborough Head map (© OpenStreetMap
   contributors, ODbL). Run by .github/workflows/fetch-osm.yml.
   Bounding boxes are (south, west, north, east). */
[out:json][timeout:180];
(
  /* mean high water line for the whole map area */
  way["natural"="coastline"](53.97,-0.36,54.26,0.02);

  /* intertidal ground and named coastal features round the headland */
  nwr["natural"~"^(reef|shoal|bare_rock|rock|stone|beach|shingle|sand|mud|cliff|arch|cave_entrance|bay|cape|peninsula|strait|stack)$"](54.06,-0.26,54.17,-0.04);
  nwr["wetland"="tidalflat"](54.06,-0.26,54.17,-0.04);
  nwr["tidal"="yes"](54.06,-0.26,54.17,-0.04);
  nwr["seamark:type"](54.03,-0.26,54.18,0.02);
  nwr["man_made"~"^(lighthouse|breakwater|groyne|pier|slipway)$"](54.06,-0.26,54.17,-0.04);
  nwr["leisure"="slipway"](54.06,-0.26,54.17,-0.04);
);
out geom tags;
