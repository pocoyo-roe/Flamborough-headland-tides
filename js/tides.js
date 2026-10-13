// Tidal stream maths. No DOM access, so it runs in the browser and under Node
// (see tools/check-tides.mjs).
(function (root) {
  const DEG = Math.PI / 180;

  // Stream rate for a spring/neap mix: 0 = neaps, 1 = springs.
  function rowRate(row, springness) {
    return row.neap + (row.spring - row.neap) * springness;
  }

  // Set (degrees true, the direction the water flows towards) and rate as an
  // east/north velocity in knots.
  function toVector(set, rate) {
    return { u: rate * Math.sin(set * DEG), v: rate * Math.cos(set * DEG) };
  }

  function fromVector(u, v) {
    const rate = Math.hypot(u, v);
    const set = ((Math.atan2(u, v) / DEG) + 360) % 360;
    return { set, rate };
  }

  // Velocity at one diamond, `hour` relative to HW (-6..+6, fractional allowed).
  // Hourly rows are blended as vectors so a reversing stream passes through
  // slack instead of swinging round the compass.
  function diamondVector(diamond, hour, springness) {
    const rows = diamond.table;
    const x = Math.min(Math.max(hour + 6, 0), rows.length - 1);
    const i = Math.min(Math.floor(x), rows.length - 2);
    const t = x - i;
    const a = toVector(rows[i].set, rowRate(rows[i], springness));
    const b = toVector(rows[i + 1].set, rowRate(rows[i + 1], springness));
    return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t };
  }

  // Distance in km between two lat/lon points (equirectangular is plenty here).
  function distKm(lat1, lon1, lat2, lon2) {
    const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * DEG);
    const y = lat2 - lat1;
    return Math.hypot(x, y) * 111.32;
  }

  // Velocity anywhere: inverse-distance-weighted blend of every diamond.
  function fieldVector(diamonds, lat, lon, hour, springness) {
    let su = 0, sv = 0, sw = 0;
    for (const d of diamonds) {
      const vec = diamondVector(d, hour, springness);
      const dist = distKm(lat, lon, d.lat, d.lon);
      if (dist < 0.05) return vec;
      const w = 1 / (dist * dist);
      su += vec.u * w; sv += vec.v * w; sw += w;
    }
    return { u: su / sw, v: sv / sw };
  }

  // The set at a diamond's fastest row: the axis its stream mostly runs along.
  function principalSet(diamond) {
    let best = diamond.table[0];
    for (const r of diamond.table) if (r.spring > best.spring) best = r;
    return best.set;
  }

  // Component of a velocity along a direction (knots, signed).
  function along(vec, set) {
    return vec.u * Math.sin(set * DEG) + vec.v * Math.cos(set * DEG);
  }

  // Smallest angle between two bearings, 0..180.
  function angleBetween(a, b) {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return d > 180 ? 360 - d : d;
  }

  // Ray-casting point-in-polygon on [lat, lon] pairs.
  function inPolygon(lat, lon, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(set) {
    return COMPASS[Math.round(set / 22.5) % 16];
  }

  const api = { rowRate, toVector, fromVector, diamondVector, fieldVector, principalSet, along, angleBetween, inPolygon, compass, distKm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tides = api;
})(typeof window !== 'undefined' ? window : globalThis);
