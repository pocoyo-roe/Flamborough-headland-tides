/* global L, Tides */
(function () {
  const DATA = window.TIDAL_DATA;
  const LAND = window.LAND_OUTLINE;
  const ISLETS = window.LAND_ISLETS || [];
  const INTERTIDAL = window.INTERTIDAL || { areas: [], cliffs: [] };
  const LOCAL = window.LOCAL_KNOWLEDGE || { key: [], glossary: [] };
  const LOCAL_NAMES = window.LOCAL_NAMES || [];
  const diamonds = DATA.diamonds;
  const byId = Object.fromEntries(diamonds.map((d) => [d.id, d]));

  // The diamond with the fastest spring stream is "the race"; the one furthest
  // east stands in for the open-sea stream. Both are derived from the data so
  // the narrative keeps working if the tables are replaced.
  const maxSpring = (d) => Math.max(...d.table.map((r) => r.spring));
  const race = diamonds.reduce((a, b) => (maxSpring(b) > maxSpring(a) ? b : a));
  const offshore = diamonds.reduce((a, b) => (b.lon > a.lon ? b : a));
  const eddyN = diamonds.find((d) => d.eddy === 'N');
  const eddyS = diamonds.find((d) => d.eddy === 'S');

  const DOMAIN = { s: 53.985, n: 54.245, w: -0.31, e: 0.12 };
  const PERIOD = 12.42;

  const state = {
    hour: -3,
    spring: 1,
    wind: null,
    selected: race.id,
    playing: false,
    hwMinutes: null,
    hwIndex: null, // index into tideData.highs when forecast tides drive the clock
  };

  const $ = (id) => document.getElementById(id);
  const fmt1 = (x) => x.toFixed(1);
  const pad = (n) => String(n).padStart(2, '0');
  const portShort = DATA.referencePort.replace(/\s*\(.*\)/, '');

  function hourLabel(h) {
    if (Math.abs(h) < 1e-6) return portShort;
    const sign = h < 0 ? '−' : '+';
    const a = Math.abs(h);
    const hh = Math.floor(a + 1e-6);
    const mm = Math.round((a - hh) * 60);
    return `${portShort} ${sign}${hh}h${mm ? ` ${pad(mm)}m` : ''}`;
  }

  function clockLabel(h) {
    if (tideData && state.hwIndex != null) return fmtWhen(hwTime() + h * HOUR_MS, true);
    if (state.hwMinutes == null) return '';
    const m = ((Math.round(state.hwMinutes + h * 60) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }

  // ---------------------------------------------------------------- forecast tides
  // data/tides.json (tools/refresh_tides.py): modelled sea level for
  // Bridlington from Open-Meteo, with the high and low waters found in it.
  const HOUR_MS = 3600e3;
  let tideData = null;
  const londonTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const londonDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric' });
  const londonWeekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });
  function fmtWhen(ms, withDay) {
    const d = new Date(ms);
    return withDay ? `${londonWeekday.format(d)} ${londonTime.format(d)}` : londonTime.format(d);
  }

  function loadTides(j) {
    if (!j || !Array.isArray(j.events) || !j.events.length) return;
    const events = j.events.map((e) => ({ ...e, ms: Date.parse(e.time.replace('Z', ':00Z')) }));
    const highs = events.filter((e) => e.type === 'HW');
    // Range of each tide: mean of the falls to the low waters either side.
    for (const hw of highs) {
      const i = events.indexOf(hw);
      const falls = [events[i - 1], events[i + 1]].filter((e) => e && e.type === 'LW').map((e) => hw.height - e.height);
      hw.range = falls.length ? falls.reduce((a, b) => a + b, 0) / falls.length : null;
    }
    tideData = { ...j, events, highs, startMs: Date.parse(j.start.replace('Z', ':00Z')) };
  }

  const hwTime = () => tideData.highs[state.hwIndex].ms;
  const absTime = () => hwTime() + state.hour * HOUR_MS;

  // Spring/neap blend from a tide's range, against Bridlington's mean ranges.
  function springFromRange(range) {
    const { MHWS, MHWN, MLWN, MLWS } = DATA.levels;
    const sp = MHWS - MLWS, np = MHWN - MLWN;
    return Math.min(1, Math.max(0, (range - np) / (sp - np)));
  }

  // Point the clock at an absolute time: the nearest forecast high water
  // becomes "HW" and the slider shows hours from it.
  function setAbsolute(ms, fromPlay) {
    let best = 0;
    tideData.highs.forEach((h, i) => { if (Math.abs(h.ms - ms) < Math.abs(tideData.highs[best].ms - ms)) best = i; });
    selectHigh(best, (ms - tideData.highs[best].ms) / HOUR_MS, fromPlay);
  }

  function selectHigh(i, hour, fromPlay) {
    state.hwIndex = i;
    const hw = tideData.highs[i];
    if (hw.range != null) { state.spring = springFromRange(hw.range); $('range').value = state.spring; }
    setHour(hour, fromPlay);
  }

  // Modelled sea level (m above MSL) at an absolute time, from the hourly series.
  function seaLevelAt(ms) {
    const x = (ms - tideData.startMs) / HOUR_MS, i = Math.floor(x), t = x - i;
    const a = tideData.hourly[i], b = tideData.hourly[i + 1];
    return a == null || b == null ? null : a + (b - a) * t;
  }

  function renderTideList() {
    const box = $('tide-list');
    if (!tideData) { $('tide-card').hidden = true; return; }
    $('tide-card').hidden = false;
    const now = Date.now();
    const days = new Map();
    for (const e of tideData.events) {
      if (e.ms < now - 12 * HOUR_MS) continue;
      const k = londonDay.format(new Date(e.ms));
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(e);
    }
    const sel = state.hwIndex != null ? tideData.highs[state.hwIndex] : null;
    box.replaceChildren(...[...days].slice(0, 8).map(([day, evs]) => {
      const row = document.createElement('div');
      row.className = 'tide-day';
      const h = document.createElement('span');
      h.className = 'tide-date';
      h.textContent = day;
      const list = document.createElement('div');
      list.className = 'tide-evs';
      row.append(h, list);
      for (const e of evs) {
        const b = document.createElement(e.type === 'HW' ? 'button' : 'span');
        b.className = `tide-ev ${e.type === 'HW' ? 'hw' : 'lw'}${e === sel ? ' selected' : ''}${e.ms < now ? ' past' : ''}`;
        b.innerHTML = `<span class="tide-type">${e.type}</span> ${fmtWhen(e.ms)} <span class="tide-h">${e.height >= 0 ? '+' : ''}${e.height.toFixed(1)} m</span>`;
        if (e.type === 'HW') {
          b.type = 'button';
          b.title = `Use this high water${e.range != null ? ` (range ${e.range.toFixed(1)} m)` : ''}`;
          b.addEventListener('click', () => { togglePlay(false); selectHigh(tideData.highs.indexOf(e), 0); });
        }
        list.append(b);
      }
      return row;
    }));
    const fetched = Date.parse(tideData.fetchedAt.replace('Z', ':00Z'));
    $('tide-meta').textContent = `Modelled by Open-Meteo, fetched ${londonDay.format(new Date(fetched))} ${fmtWhen(fetched)}. Heights are metres above mean sea level; times can be 20–30 min out.`;
    const last = tideData.highs.at(-1).ms;
    $('tide-stale').hidden = last > now;
  }

  // ---------------------------------------------------------------- map
  const map = L.map('map', {
    center: [54.112, -0.12],
    zoom: window.matchMedia('(max-width: 820px)').matches ? 11 : 12,
    minZoom: 10,
    maxZoom: 18,
    maxBounds: [[53.85, -0.6], [54.38, 0.4]],
    zoomControl: false,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  window.flamMap = map; // handy for debugging from the console

  // Base map: web tiles where the page may load them, otherwise a drawn chart
  // (buff land, shallow-water tint, graticule) for hosts that block tile servers.
  const CONFIG = Object.assign({ tiles: true }, window.FLAM_CONFIG);
  if (CONFIG.tiles) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'base-tiles',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 0.8,
      attribution: 'Seamarks © <a href="https://www.openseamap.org">OpenSeaMap</a>',
    }).addTo(map);
  } else {
    drawChartBase();
  }

  function drawChartBase() {
    map.getContainer().classList.add('drawn-chart');
    map.attributionControl.addAttribution(window.LAND_ISLETS
      ? 'Coastline © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · not for navigation'
      : 'Simplified coastline · not for navigation');
    // Graticule every 5 minutes of arc.
    const step = 5 / 60;
    for (let lat = Math.ceil(53.85 / step) * step; lat < 54.38; lat += step) {
      L.polyline([[lat, -0.6], [lat, 0.4]], { className: 'graticule', interactive: false }).addTo(map);
    }
    for (let lon = Math.ceil(-0.6 / step) * step; lon < 0.4; lon += step) {
      L.polyline([[53.85, lon], [54.38, lon]], { className: 'graticule', interactive: false }).addTo(map);
    }
    // A wide pale stroke under the land reads as the shallow-water tint along the shore.
    L.polygon(LAND, { className: 'shallows', interactive: false }).addTo(map);
    // Ground that dries at low water: rock scars and sand, under the land.
    for (const a of INTERTIDAL.areas) {
      const poly = L.polygon(a.ring, { className: `drying drying-${a.kind}`, interactive: !!a.name, smoothFactor: 0.5 }).addTo(map);
      if (a.name) poly.bindTooltip(a.name, { className: 'ln-tip', sticky: true });
    }
    // Land sits in its own pane above the race and eddy overlays.
    map.createPane('land').style.zIndex = 405;
    const onLand = { pane: 'land', interactive: false, smoothFactor: 0.5 };
    L.polygon(LAND, { ...onLand, className: 'land' }).addTo(map);
    for (const r of ISLETS) L.polygon(r, { ...onLand, className: 'land' }).addTo(map);
    for (const c of INTERTIDAL.cliffs) L.polyline(c, { ...onLand, className: 'cliff' }).addTo(map);

    const places = [
      ['Filey', 54.212, -0.305], ['Speeton', 54.158, -0.245], ['Bempton', 54.130, -0.180],
      ['Flamborough', 54.112, -0.125], ['Sewerby', 54.103, -0.170], ['Bridlington', 54.085, -0.218],
      ['North Landing', 54.129, -0.118], ['South Landing', 54.106, -0.118],
    ];
    for (const [text, lat, lon] of places) {
      L.marker([lat, lon], {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'land-label', html: `<span>${text}</span>`, iconSize: [0, 0] }),
      }).addTo(map);
    }
    // Flamborough Head lighthouse.
    L.marker([54.1162, -0.0827], {
      interactive: false, keyboard: false,
      icon: L.divIcon({
        className: 'light',
        html: '<span class="light-flare" aria-hidden="true"></span><span class="light-text">Flamborough Hd<br>Fl(4)15s</span>',
        iconSize: [0, 0],
      }),
    }).addTo(map);

    // Edge labels for the graticule, kept at the top and left of the view.
    const edge = document.createElement('div');
    edge.className = 'graticule-labels';
    map.getContainer().appendChild(edge);
    const dm = (v, pos, neg) => `${Math.floor(Math.abs(v))}°${pad(Math.round((Math.abs(v) % 1) * 60) % 60)}′${v < 0 ? neg : pos}`;
    function placeEdge() {
      const b = map.getBounds();
      const out = [];
      for (let lat = Math.ceil(b.getSouth() / step) * step; lat < b.getNorth(); lat += step) {
        const y = map.latLngToContainerPoint([lat, b.getWest()]).y;
        out.push(`<span class="gl gl-lat" style="top:${y}px">${dm(lat + 1e-9, 'N', 'S')}</span>`);
      }
      for (let lon = Math.ceil(b.getWest() / step) * step; lon < b.getEast(); lon += step) {
        const x = map.latLngToContainerPoint([b.getNorth(), lon]).x;
        out.push(`<span class="gl gl-lon" style="left:${x}px">${dm(lon + (lon < 0 ? -1e-9 : 1e-9), 'E', 'W')}</span>`);
      }
      edge.innerHTML = out.join('');
    }
    map.on('move zoom resize', placeEdge);
    map.whenReady(placeEdge);
  }

  // Overfalls / race zone off the tip of the head.
  const raceZone = L.circle([54.117, -0.048], {
    radius: 1900,
    className: 'race-zone',
    interactive: false,
  }).addTo(map);

  // Eddy loops, drawn in their direction of travel so the animated dashes
  // show which way the water circulates.
  const eddyPaths = {
    S: [[54.074, -0.172], [54.090, -0.140], [54.100, -0.108], [54.104, -0.082], [54.097, -0.062],
      [54.082, -0.068], [54.070, -0.098], [54.064, -0.135], [54.066, -0.160], [54.074, -0.172]],
    N: [[54.142, -0.130], [54.136, -0.112], [54.131, -0.098], [54.1245, -0.082], [54.121, -0.072],
      [54.128, -0.060], [54.140, -0.064], [54.150, -0.088], [54.151, -0.118], [54.142, -0.130]],
  };
  const eddyLayers = {};
  for (const k of Object.keys(eddyPaths)) {
    eddyLayers[k] = L.polyline(eddyPaths[k], { className: 'eddy', interactive: false, smoothFactor: 0 }).addTo(map);
  }

  const waterLabels = [
    ['Filey Bay', 54.185, -0.24],
    ['Bridlington Bay', 54.060, -0.115],
    ['Smithic Sands', 54.077, -0.178],
    ['Thornwick Bay', 54.1385, -0.117],
    ['Silex', 54.1245, -0.067],
    ['Tide race', 54.105, -0.022],
    ['North Sea', 54.170, 0.06],
  ];
  for (const [text, lat, lon] of waterLabels) {
    L.marker([lat, lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'water-label', html: `<span>${text}</span>`, iconSize: [0, 0] }),
    }).addTo(map);
  }

  // Local names for the coves, rocks and cliffs: dots from zoom 13 (name on
  // hover or tap), labels from zoom 15.
  for (const n of LOCAL_NAMES) {
    L.marker([n.lat, n.lon], {
      keyboard: false,
      icon: L.divIcon({
        className: `local-name${n.kind === 'rock' ? ' rock' : ''}`,
        html: `<span class="ln-dot"></span><span class="ln-text">${n.name}</span>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    }).bindTooltip(n.name, { direction: 'top', offset: [0, -4], className: 'ln-tip' }).addTo(map);
  }
  function zoomClass() {
    const z = map.getZoom(), c = map.getContainer().classList;
    c.toggle('show-local', z >= 13);
    c.toggle('show-local-text', z >= 15);
  }
  map.on('zoomend', zoomClass);
  zoomClass();

  // The North Smithic buoy: a north cardinal (black over yellow, two cones up).
  if (LOCAL.buoy) {
    const bu = LOCAL.buoy;
    L.marker([bu.lat, bu.lon], {
      keyboard: false,
      title: `${bu.name} buoy (north cardinal, ${bu.light}): "the buoy" in the local tidal key`,
      icon: L.divIcon({
        className: 'buoy',
        html: `<svg viewBox="-8 -22 16 26" width="16" height="26" aria-hidden="true">
            <path class="buoy-cone" d="M-4,-14 L0,-20 L4,-14 Z M-4,-8 L0,-14 L4,-8 Z"/>
            <path class="buoy-top" d="M-5,-6 L5,-6 L5,-1 L-5,-1 Z"/>
            <path class="buoy-bottom" d="M-5,-1 L5,-1 L4,3 L-4,3 Z"/>
          </svg><span class="buoy-text">${bu.name}<br>${bu.light}</span>`,
        iconSize: [16, 26],
        iconAnchor: [8, 22],
      }),
    }).addTo(map);
  }

  // Tidal diamond markers: ADMIRALTY-style magenta diamond plus a live arrow.
  const markers = {};
  for (const d of diamonds) {
    const html = `
      <div class="dm" data-id="${d.id}">
        <svg class="dm-arrow" viewBox="-50 -50 100 100" aria-hidden="true">
          <g class="dm-rot"><line x1="0" y1="-14" x2="0" y2="-20"/><path d="M-6,-20 L0,-32 L6,-20 Z"/></g>
        </svg>
        <div class="dm-diamond"><span>${d.id}</span></div>
        <div class="dm-rate"></div>
      </div>`;
    const m = L.marker([d.lat, d.lon], {
      icon: L.divIcon({ className: 'dm-icon', html, iconSize: [24, 24], iconAnchor: [12, 12] }),
      title: `Tidal diamond ${d.id}: ${d.name}`,
      alt: `Tidal diamond ${d.id}`,
      riseOnHover: true,
    }).addTo(map);
    m.on('click', () => { state.selected = d.id; render(); });
    markers[d.id] = m;
  }

  function updateMarkers() {
    for (const d of diamonds) {
      const el = markers[d.id].getElement();
      if (!el) continue;
      const { set, rate } = Tides.fromVector(...uv(Tides.diamondVector(d, state.hour, state.spring)));
      const len = 14 + 4 + Math.min(rate, 3.5) * 8;
      const rot = el.querySelector('.dm-rot');
      rot.setAttribute('transform', `rotate(${set})`);
      rot.querySelector('line').setAttribute('y2', -len);
      rot.querySelector('path').setAttribute('d', `M-6,${-len} L0,${-len - 12} L6,${-len} Z`);
      rot.style.opacity = rate < 0.05 ? 0 : 1;
      // Rate label sits on the opposite side of the diamond from the arrow.
      const lab = el.querySelector('.dm-rate');
      lab.textContent = `${fmt1(rate)} kn`;
      const back = (set + 180) * Math.PI / 180;
      lab.style.left = `${Math.sin(back) * 26}px`;
      lab.style.top = `${-Math.cos(back) * 22}px`;
      el.querySelector('.dm').classList.toggle('selected', d.id === state.selected);
    }
  }

  const uv = (vec) => [vec.u, vec.v];

  // ---------------------------------------------------------------- particles
  const canvas = document.createElement('canvas');
  canvas.className = 'flow-canvas';
  map.getContainer().appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let particles = [];
  let dpr = 1;

  function sizeCanvas() {
    const s = map.getSize();
    dpr = window.devicePixelRatio || 1;
    canvas.width = s.x * dpr;
    canvas.height = s.y * dpr;
    canvas.style.width = `${s.x}px`;
    canvas.style.height = `${s.y}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.round(Math.min(2200, (s.x * s.y) / 260));
    while (particles.length < target) particles.push(spawn({}));
    particles.length = target;
  }

  // Land mask as a raster, filled row by row from the coastline polygon, so
  // the per-frame sea test is a lookup rather than a point-in-polygon test.
  const MASK_STEP = 0.00025; // degrees, about 28 m of latitude
  const MASK_ROWS = Math.ceil((DOMAIN.n - DOMAIN.s) / MASK_STEP);
  const MASK_COLS = Math.ceil((DOMAIN.e - DOMAIN.w) / MASK_STEP);
  const landMask = new Uint8Array(MASK_ROWS * MASK_COLS);
  for (let r = 0; r < MASK_ROWS; r++) {
    const lat = DOMAIN.s + (r + 0.5) * MASK_STEP;
    for (const ring of [LAND, ...ISLETS]) {
      const xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [yi, xi] = ring[i], [yj, xj] = ring[j];
        if ((yi > lat) !== (yj > lat)) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - DOMAIN.w) / MASK_STEP - 0.5));
        const c1 = Math.min(MASK_COLS - 1, Math.floor((xs[k + 1] - DOMAIN.w) / MASK_STEP - 0.5));
        for (let c = c0; c <= c1; c++) landMask[r * MASK_COLS + c] = 1;
      }
    }
  }

  function isSea(lat, lon) {
    if (!(lat > DOMAIN.s && lat < DOMAIN.n && lon > DOMAIN.w && lon < DOMAIN.e)) return false;
    const r = Math.floor((lat - DOMAIN.s) / MASK_STEP), c = Math.floor((lon - DOMAIN.w) / MASK_STEP);
    return !landMask[r * MASK_COLS + c];
  }

  function spawn(p) {
    const b = map.getBounds();
    const s = Math.max(b.getSouth(), DOMAIN.s), n = Math.min(b.getNorth(), DOMAIN.n);
    const w = Math.max(b.getWest(), DOMAIN.w), e = Math.min(b.getEast(), DOMAIN.e);
    for (let tries = 0; tries < 20; tries++) {
      const lat = s + Math.random() * (n - s);
      const lon = w + Math.random() * (e - w);
      if (isSea(lat, lon)) {
        p.lat = lat; p.lon = lon; p.age = 0; p.life = 40 + Math.random() * 80;
        return p;
      }
    }
    p.lat = 54.12; p.lon = 0.05; p.age = 0; p.life = 1;
    return p;
  }

  // Colour by speed: one hue, light to dark (dark mode: dark to light).
  const SPEED_STEPS = [0.25, 0.75, 1.25, 1.75, 2.25, Infinity];
  let speedColors = [];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    speedColors = SPEED_STEPS.map((_, i) => cs.getPropertyValue(`--flow-${i + 1}`).trim());
  }

  const SIM_HOURS_PER_SEC = 0.35; // how fast the streaks move
  const PLAY_HOURS_PER_SEC = 0.4; // how fast time runs when playing

  function idwVector(vecs, lat, lon) {
    let su = 0, sv = 0, sw = 0;
    const c = Math.cos(lat * Math.PI / 180);
    for (let i = 0; i < diamonds.length; i++) {
      const dx = (lon - diamonds[i].lon) * c, dy = lat - diamonds[i].lat;
      const w = 1 / (dx * dx + dy * dy + 1e-7);
      su += vecs[i].u * w; sv += vecs[i].v * w; sw += w;
    }
    return [su / sw, sv / sw];
  }

  let last = performance.now();
  let moving = false;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    if (state.playing) {
      if (tideData && state.hwIndex != null) {
        const next = absTime() + dt * PLAY_HOURS_PER_SEC * HOUR_MS;
        if (next > tideData.highs.at(-1).ms + 6 * HOUR_MS) togglePlay(false);
        else setAbsolute(next, true);
      } else {
        let h = state.hour + dt * PLAY_HOURS_PER_SEC;
        if (h > 6) h -= 12;
        setHour(h, true);
      }
    }

    const size = map.getSize();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, size.x, size.y);
    ctx.globalCompositeOperation = 'source-over';

    if (!moving) {
      const vecs = diamonds.map((d) => Tides.diamondVector(d, state.hour, state.spring));
      const buckets = SPEED_STEPS.map(() => []);
      // knots -> degrees of latitude this frame; slower when zoomed in so the
      // streaks keep a similar length on screen
      const k = (SIM_HOURS_PER_SEC * dt) / 60 * Math.pow(2, 12 - map.getZoom()) ** 0.8;
      for (const p of particles) {
        const [u, v] = idwVector(vecs, p.lat, p.lon);
        const lat2 = p.lat + v * k;
        const lon2 = p.lon + (u * k) / Math.cos(p.lat * Math.PI / 180);
        p.age++;
        if (p.age > p.life || !isSea(lat2, lon2)) { spawn(p); continue; }
        const a = map.latLngToContainerPoint([p.lat, p.lon]);
        const b = map.latLngToContainerPoint([lat2, lon2]);
        const speed = Math.hypot(u, v);
        let bi = 0;
        while (speed > SPEED_STEPS[bi]) bi++;
        buckets[bi].push(a.x, a.y, b.x, b.y);
        p.lat = lat2; p.lon = lon2;
      }
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      buckets.forEach((segs, i) => {
        if (!segs.length) return;
        ctx.strokeStyle = speedColors[i];
        ctx.beginPath();
        for (let j = 0; j < segs.length; j += 4) { ctx.moveTo(segs[j], segs[j + 1]); ctx.lineTo(segs[j + 2], segs[j + 3]); }
        ctx.stroke();
      });
    }
    requestAnimationFrame(frame);
  }

  map.on('movestart zoomstart', () => { moving = true; ctx.clearRect(0, 0, canvas.width, canvas.height); });
  map.on('moveend zoomend', () => { moving = false; particles.forEach(spawn); });
  map.on('resize', sizeCanvas);

  // ---------------------------------------------------------------- narrative
  function strengthWord(d) {
    const now = Tides.fromVector(...uv(Tides.diamondVector(d, state.hour, state.spring))).rate;
    const soon = Tides.fromVector(...uv(Tides.diamondVector(d, Math.min(state.hour + 0.25, 6), state.spring))).rate;
    const peak = Math.max(...d.table.map((r) => Tides.rowRate(r, state.spring)));
    const f = now / peak;
    if (now < 0.3) return { rate: now, word: 'slack', text: 'slack water: the stream is turning' };
    if (f > 0.85) return { rate: now, word: 'peak', text: 'near its strongest' };
    return { rate: now, word: soon > now ? 'building' : 'easing', text: soon > now ? 'building' : 'easing' };
  }

  function narrative() {
    const out = [];
    const rv = Tides.diamondVector(race, state.hour, state.spring);
    const r = Tides.fromVector(rv.u, rv.v);
    const s = strengthWord(race);
    const going = rv.v < 0 ? 'flood (south-going)' : 'ebb (north-going)';
    if (s.word === 'slack') {
      out.push(`<p><strong>Off the head it is slack water.</strong> The stream is turning; this is the calmest time to round Flamborough Head.</p>`);
    } else {
      out.push(`<p><strong>The ${going} is ${s.text}</strong>, running ${Tides.compass(r.set)} at about ${fmt1(r.rate)} kn through the race (diamond ${race.id}).</p>`);
    }

    const ov = Tides.diamondVector(offshore, state.hour, state.spring);
    const o = Tides.fromVector(ov.u, ov.v);
    if (r.rate > 0.2 && o.rate > 0.2 && Tides.angleBetween(r.set, o.set) > 90) {
      out.push(`<p>Close to the head the stream has <strong>already turned</strong>, while ${offshore.name.toLowerCase()} it still runs ${Tides.compass(o.set)}.</p>`);
    } else if (r.rate < 0.3 && o.rate > 0.3) {
      out.push(`<p>Offshore (diamond ${offshore.id}) the stream is still running ${Tides.compass(o.set)} at ${fmt1(o.rate)} kn: the head turns first.</p>`);
    }

    for (const d of [eddyN, eddyS]) {
      const a = d && eddyActive(d);
      if (a) out.push(`<p><strong>${a.title}:</strong> ${a.text}</p>`);
    }
    if (eddyS && r.rate > 0.5) {
      const g = Tides.diamondVector(eddyS, state.hour, state.spring);
      if (Math.hypot(g.u, g.v) < 0.1) out.push(`<p><strong>Slack in the bay:</strong> no tide inside Bridlington Bay from Dykes to Cattlemere Hole (diamond ${eddyS.id}), while the main stream runs outside.</p>`);
    }

    const wa = windAgainstTide();
    if (wa) {
      out.push(`<p class="alert"><strong>Wind against tide.</strong> Wind from ${Tides.compass(state.wind)} is blowing against a ${fmt1(wa)} kn stream. Expect steep, breaking overfalls in the race; keep at least 2 nm off the head.</p>`);
    } else if (state.wind != null && s.word !== 'slack') {
      out.push(`<p class="muted">Wind from ${Tides.compass(state.wind)} is not opposing the stream in the race just now.</p>`);
    }
    return out.join('');
  }

  // The local tidal key entry for the current time: the latest one at or before it.
  function localEntry() {
    let e = null;
    for (const k of LOCAL.key) if (k.hour <= state.hour + 1e-6) e = k;
    return e;
  }

  function renderLocal() {
    const e = localEntry();
    if (!e) return;
    const when = e.label || (e.hour === 0 ? 'High water' : `HW${e.hour > 0 ? '+' : '−'}${String(Math.abs(e.hour)).replace('.5', '½')}`);
    $('local-when').textContent = when;
    $('local-text').textContent = e.text;
  }

  // Inshore water running against the race. Its local name depends on which
  // way it is going: towards the head end against the ebb is the hive (north
  // side) or the outset (Bridlington Bay); against the flood it is the inshore
  // ebb running before the offing turns.
  function eddyActive(d) {
    const rv = Tides.diamondVector(race, state.hour, state.spring);
    const ev = Tides.diamondVector(d, state.hour, state.spring);
    const r = Tides.fromVector(rv.u, rv.v), e = Tides.fromVector(ev.u, ev.v);
    if (!(r.rate > 0.4 && e.rate > 0.15 && Tides.angleBetween(r.set, e.set) > 90)) return null;
    const raceFlooding = rv.v < 0;
    const dir = `${Tides.compass(e.set)} at ${fmt1(e.rate)} kn`;
    if (d.eddy === 'N') {
      return raceFlooding
        ? { ...e, title: 'Ebb inside, flood in the offing', text: `inside the 10 fathom line off North Landing (diamond ${d.id}) the ebb has started, running ${dir}, while the flood still runs outside.` }
        : state.hour >= 5.5 || state.hour < -4
          ? { ...e, title: 'Young flood inshore', text: `the flood has started up shore at North Head (diamond ${d.id}, ${dir}) while the best of the ebb still runs in the offing.` }
          : { ...e, title: 'The hive', text: `a flood tide inside at North Head during the ebb. Off North Landing (diamond ${d.id}) the inshore water runs ${dir}, towards the head end.` };
    }
    return raceFlooding
      ? { ...e, title: 'The outset', text: `the ebb running ashore before high water. Inside Bridlington Bay (diamond ${d.id}) the water runs ${dir}, back towards the head end against the flood.` }
      : { ...e, title: 'Inshore in the bay', text: `the water inside the bay (diamond ${d.id}) runs ${dir}, against the main stream.` };
  }

  function windAgainstTide() {
    if (state.wind == null) return 0;
    const rv = Tides.diamondVector(race, state.hour, state.spring);
    const r = Tides.fromVector(rv.u, rv.v);
    const windTowards = (state.wind + 180) % 360;
    return r.rate >= 1 && Tides.angleBetween(windTowards, r.set) > 120 ? r.rate : 0;
  }

  // ---------------------------------------------------------------- chart
  const svg = $('chart');
  const tip = $('chart-tip');
  const NS = 'http://www.w3.org/2000/svg';
  let chartGeom = null;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function drawChart() {
    const d = byId[state.selected];
    const axis = Tides.principalSet(d);
    const W = svg.clientWidth || 300, H = 170;
    const m = { l: 34, r: 12, t: 14, b: 24 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.replaceChildren();

    const series = [
      { key: 'Springs', sp: 1, cls: 's1' },
      { key: 'Neaps', sp: 0, cls: 's2' },
    ].map((s) => {
      const pts = [];
      for (let h = -6; h <= 6.001; h += 0.25) pts.push([h, Tides.along(Tides.diamondVector(d, h, s.sp), axis)]);
      return { ...s, pts };
    });
    const ymax = Math.max(1, Math.ceil(Math.max(...series[0].pts.map((p) => Math.abs(p[1]))) * 2) / 2);
    const ymin = Math.min(0, ...series[0].pts.map((p) => p[1])) < -0.05 ? -ymax : -Math.min(ymax, 0.5);
    const x = (h) => m.l + ((h + 6) / 12) * (W - m.l - m.r);
    const y = (v) => m.t + ((ymax - v) / (ymax - ymin)) * (H - m.t - m.b);
    chartGeom = { x, y, m, W, H, d, axis, series };

    const g = el('g', { class: 'grid' }, svg);
    for (const h of [-6, -3, 0, 3, 6]) {
      el('line', { x1: x(h), x2: x(h), y1: m.t, y2: H - m.b }, g);
      const t = el('text', { x: x(h), y: H - 6, 'text-anchor': 'middle', class: 'tick' }, svg);
      t.textContent = h === 0 ? 'HW' : (h > 0 ? `+${h}` : `−${-h}`);
    }
    for (let v = Math.ceil(ymin); v <= ymax; v += 1) {
      const t = el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      t.textContent = Math.abs(v);
    }
    el('line', { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: 'zero' }, svg);
    const up = el('text', { x: W - m.r, y: m.t + 8, 'text-anchor': 'end', class: 'axis-note' }, svg);
    up.textContent = `kn towards ${Tides.compass(axis)} ↑`;
    if (ymin < -0.6) {
      const dn = el('text', { x: W - m.r, y: H - m.b - 5, 'text-anchor': 'end', class: 'axis-note' }, svg);
      dn.textContent = `kn towards ${Tides.compass((axis + 180) % 360)} ↓`;
    }

    for (const s of series) {
      el('path', { d: s.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(''), class: `line ${s.cls}` }, svg);
      // direct label at the series' peak
      const peak = s.pts.reduce((a, b) => (b[1] > a[1] ? b : a));
      const lbl = el('text', { x: x(peak[0]) + 6, y: y(peak[1]) - 4, class: 'series-label' }, svg);
      lbl.textContent = s.key;
    }

    const cur = el('g', { class: 'cursor' }, svg);
    el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'now-line' }, cur);
    el('circle', { cx: 0, cy: 0, r: 4.5, class: 'now-dot' }, cur);
    const hover = el('g', { class: 'hover', visibility: 'hidden' }, svg);
    el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'hover-line' }, hover);
    el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: 'hit', fill: 'transparent' }, svg);

    $('chart-title').textContent = `Stream along ${Math.round(axis)}°T (${Tides.compass(axis)}) at diamond ${d.id}`;
    updateChartCursor();
  }

  function updateChartCursor() {
    if (!chartGeom) return;
    const { x, y, d, axis } = chartGeom;
    const v = Tides.along(Tides.diamondVector(d, state.hour, state.spring), axis);
    const g = svg.querySelector('.cursor');
    g.querySelector('line').setAttribute('x1', x(state.hour));
    g.querySelector('line').setAttribute('x2', x(state.hour));
    g.querySelector('circle').setAttribute('cx', x(state.hour));
    g.querySelector('circle').setAttribute('cy', y(v));
  }

  function chartHourFromEvent(ev) {
    const { m, W } = chartGeom;
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const h = ((px - m.l) / (W - m.l - m.r)) * 12 - 6;
    return Math.max(-6, Math.min(6, Math.round(h * 4) / 4));
  }

  svg.addEventListener('pointermove', (ev) => {
    if (!chartGeom) return;
    const h = chartHourFromEvent(ev);
    const { x, d } = chartGeom;
    const hover = svg.querySelector('.hover');
    hover.setAttribute('visibility', 'visible');
    hover.querySelector('line').setAttribute('x1', x(h));
    hover.querySelector('line').setAttribute('x2', x(h));
    const sp = Tides.fromVector(...uv(Tides.diamondVector(d, h, 1)));
    const np = Tides.fromVector(...uv(Tides.diamondVector(d, h, 0)));
    tip.hidden = false;
    tip.innerHTML = `<strong>${hourLabel(h)}</strong>${state.hwMinutes != null ? ` · ${clockLabel(h)}` : ''}<br>
      Springs ${fmt1(sp.rate)} kn ${Tides.compass(sp.set)}<br>Neaps ${fmt1(np.rate)} kn ${Tides.compass(np.set)}`;
    const wrap = svg.parentElement.getBoundingClientRect();
    const left = ev.clientX - wrap.left;
    tip.style.left = `${Math.min(Math.max(left, 70), wrap.width - 70)}px`;
  });
  svg.addEventListener('pointerleave', () => {
    svg.querySelector('.hover')?.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
  svg.addEventListener('click', (ev) => { if (chartGeom) setHour(chartHourFromEvent(ev)); });

  // ---------------------------------------------------------------- panel
  function renderDiamond() {
    const d = byId[state.selected];
    $('diamond-badge').textContent = d.id;
    $('diamond-h').textContent = d.name;
    const lat = `${Math.floor(d.lat)}°${fmt1((d.lat % 1) * 60).padStart(4, '0')}′N`;
    const lon = `${pad(Math.floor(Math.abs(d.lon)))}°${fmt1((Math.abs(d.lon) % 1) * 60).padStart(4, '0')}′${d.lon < 0 ? 'W' : 'E'}`;
    $('diamond-pos').textContent = `Diamond ${d.id} · ${lat} ${lon}`;
    $('diamond-note').textContent = d.note;
    const tbody = $('dtable').querySelector('tbody');
    tbody.replaceChildren(...d.table.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.hour = r.hour;
      tr.innerHTML = `<th scope="row">${r.hour === 0 ? 'HW' : (r.hour > 0 ? `+${r.hour}` : `−${-r.hour}`)}</th><td>${pad(Math.round(r.set)).padStart(3, '0')}</td><td>${fmt1(r.spring)}</td><td>${fmt1(r.neap)}</td>`;
      tr.addEventListener('click', () => setHour(r.hour));
      return tr;
    }));
    drawChart();
  }

  let lastSelected = null;
  function render() {
    $('time').value = state.hour;
    $('time-label').textContent = hourLabel(state.hour);
    $('clock-label').textContent = clockLabel(state.hour);
    $('range-label').textContent = state.spring >= 0.95 ? 'Springs' : state.spring <= 0.05 ? 'Neaps' : `${Math.round(state.spring * 100)}% to springs`;

    if (lastSelected !== state.selected) { renderDiamond(); lastSelected = state.selected; }
    const d = byId[state.selected];
    const cur = Tides.fromVector(...uv(Tides.diamondVector(d, state.hour, state.spring)));
    $('stat-set').textContent = cur.rate < 0.05 ? 'slack' : `${pad(Math.round(cur.set)).padStart(3, '0')}° ${Tides.compass(cur.set)}`;
    $('stat-rate').textContent = `${fmt1(cur.rate)} kn`;
    const nearest = Math.round(state.hour);
    for (const tr of $('dtable').querySelectorAll('tbody tr')) tr.classList.toggle('current', Number(tr.dataset.hour) === nearest);
    updateChartCursor();

    $('narrative').innerHTML = narrative();
    renderLocal();
    const sea = tideData && state.hwIndex != null ? seaLevelAt(absTime()) : null;
    $('height-label').textContent = sea != null
      ? `Sea level ${sea >= 0 ? '+' : ''}${fmt1(sea)} m (above mean sea level) · range ${fmt1(tideData.highs[state.hwIndex].range ?? 0)} m`
      : DATA.levels ? `Height ≈ ${fmt1(tideHeight(state.hour))} m above chart datum (estimate)` : '';
    if (tideData) renderTideList();
    for (const [k, d2] of [['S', eddyS], ['N', eddyN]]) {
      const p = eddyLayers[k].getElement();
      if (p && d2) p.classList.toggle('active', !!eddyActive(d2));
    }
    raceZone.getElement()?.classList.toggle('active', !!windAgainstTide());
    updateMarkers();
  }

  // Estimated height of tide at the reference port: a cosine curve between
  // high and low water, with both scaled between neaps and springs.
  function tideHeight(h) {
    const { MHWS, MHWN, MLWN, MLWS } = DATA.levels;
    const typed = parseFloat($('hw-height').value);
    const hw = Number.isFinite(typed) ? typed : MHWN + (MHWS - MHWN) * state.spring;
    const lw = MLWN - (MLWN - MLWS) * state.spring;
    return lw + (hw - lw) * (1 + Math.cos((Math.PI * h) / (PERIOD / 2))) / 2;
  }

  function setHour(h, fromPlay) {
    state.hour = Math.max(-6, Math.min(6, h));
    if (!fromPlay && state.playing) togglePlay(false);
    render();
  }

  function togglePlay(on) {
    state.playing = on ?? !state.playing;
    $('play').textContent = state.playing ? '❚❚ Pause' : '▶ Play';
    $('play').setAttribute('aria-pressed', String(state.playing));
  }

  // "Why it's unusual" list: each item can jump the map to the moment it shows.
  const features = [
    {
      title: 'A tide race off the head end',
      body: `The chalk headland juts several kilometres out from the line of the coast, so the North Sea stream has to squeeze round it. Off the head end it reaches around 3 kn at springs, far faster than in the bays either side. With wind against tide this throws up dangerous overfalls; pilots advise at least a 2 nm offing.`,
      go: { hour: -2, spring: 1, center: [54.118, -0.06], zoom: 12, select: race.id, wind: '180' },
    },
    {
      title: 'Ebb inside, flood in the offing',
      body: `"+1 hour: Ebb inside to N. Landing, flood all in offing." The inshore water turns first. For a couple of hours after high water the ebb runs north-west along the shore while the flood is still running south outside, until it goes slack in the offing at HW+2½.`,
      go: { hour: 1.25, spring: 1, center: [54.125, -0.07], zoom: 12, select: eddyN ? eddyN.id : race.id },
    },
    eddyN && {
      title: 'The hive',
      body: `"Flood tide inside at N. Head during ebb." From HW+2½ a flood starts again in Silex (Selwicks Bay) while the main ebb runs north offshore. It spreads up to Breil by +3 and Thornwick by +4, and is complete from Stottlebink to Thornwick by +5. Inshore on the north side the water runs towards the head end for most of the tide.`,
      go: { hour: 4, spring: 1, center: [54.128, -0.095], zoom: 13, select: eddyN.id },
    },
    eddyS && {
      title: 'The outset',
      body: `"Ebb tide before high water ashore." In Bridlington Bay the flood runs only from about HW−5. At HW−3 the outset starts right inside from Sewerby to South Landing, running back towards the head end. It reaches out to the North Smithic buoy by HW−1 and to the head end by high water.`,
      go: { hour: -2, spring: 1, center: [54.098, -0.11], zoom: 13, select: eddyS.id },
    },
    {
      title: 'Strong ebb at the Whelk Pots',
      body: `"+3 hours: Ebb coming in offing (strong at Whelk Pots)." Three miles off Breil Newk the ebb comes in hard soon after it starts, and by +5 the best of the ebb runs all over North Head.`,
      go: { hour: 3.5, spring: 1, center: [54.14, -0.05], zoom: 12, select: 'W' },
    },
    {
      title: 'No tide in the bay at low water',
      body: `"Low water: No tide inside from Dykes to Cattlemere Hole." While the best of the ebb runs in the offing, the inshore water of Bridlington Bay, from Danes Dyke to the head end, is slack. That and the shelter from northerly weather is why the bay has long been an anchorage.`,
      go: { hour: 6, spring: 1, center: [54.098, -0.11], zoom: 12, select: eddyS ? eddyS.id : 'H' },
    },
  ].filter(Boolean);

  function renderFeatures() {
    const ol = $('features');
    ol.replaceChildren(...features.map((f) => {
      const li = document.createElement('li');
      li.innerHTML = `<h3>${f.title}</h3><p>${f.body}</p>`;
      const b = document.createElement('button');
      b.className = 'btn small-btn';
      b.type = 'button';
      b.textContent = `Show me · ${hourLabel(f.go.hour)}`;
      b.addEventListener('click', () => {
        togglePlay(false);
        if (f.go.select && byId[f.go.select]) state.selected = f.go.select;
        state.spring = f.go.spring;
        $('range').value = f.go.spring;
        const wind = f.go.wind ?? '';
        state.wind = wind === '' ? null : Number(wind);
        $('wind').value = wind;
        map.flyTo(f.go.center, f.go.zoom, { duration: 0.8 });
        setHour(f.go.hour);
        if (window.matchMedia('(max-width: 820px)').matches) document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
      });
      li.appendChild(b);
      return li;
    }));
  }

  // ---------------------------------------------------------------- controls
  $('data-source').textContent = DATA.source;
  $('hw-label').textContent = `Or type today's ${DATA.referencePort}`;
  $('time').addEventListener('input', (e) => setHour(Number(e.target.value)));
  $('range').addEventListener('input', (e) => { state.spring = Number(e.target.value); render(); });
  $('wind').addEventListener('change', (e) => { state.wind = e.target.value === '' ? null : Number(e.target.value); render(); });
  $('play').addEventListener('click', () => togglePlay());
  $('step-back').addEventListener('click', () => setHour(Math.ceil(state.hour - 1.001)));
  $('step-fwd').addEventListener('click', () => setHour(Math.floor(state.hour + 1.001)));
  $('hw-time').addEventListener('input', (e) => {
    const v = e.target.value;
    if (v) {
      const [hh, mm] = v.split(':').map(Number);
      state.hwMinutes = hh * 60 + mm;
      state.hwIndex = null; // a typed time overrides the forecast
    } else state.hwMinutes = null;
    $('now').disabled = state.hwMinutes == null && !tideData;
    try { localStorage.setItem('hwTime', JSON.stringify({ v, day: new Date().toDateString() })); } catch (_) { /* storage unavailable */ }
    render();
  });
  $('hw-height').addEventListener('input', (e) => {
    const h = parseFloat(e.target.value);
    if (!Number.isFinite(h)) return;
    const { MHWS, MHWN } = DATA.levels;
    state.spring = Math.min(1, Math.max(0, (h - MHWN) / (MHWS - MHWN)));
    $('range').value = state.spring;
    render();
  });
  $('now').addEventListener('click', () => {
    if (tideData && state.hwMinutes == null) { togglePlay(false); setAbsolute(Date.now()); return; }
    const d = new Date();
    let h = (d.getHours() * 60 + d.getMinutes() - state.hwMinutes) / 60;
    h -= Math.round(h / PERIOD) * PERIOD; // nearest high water
    setHour(Math.round(h * 4) / 4);
  });
  try {
    const saved = JSON.parse(localStorage.getItem('hwTime') || 'null');
    if (saved && saved.day === new Date().toDateString() && saved.v) {
      $('hw-time').value = saved.v;
      $('hw-time').dispatchEvent(new Event('input'));
    }
  } catch (_) { /* storage unavailable */ }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { map.invalidateSize(); sizeCanvas(); drawChart(); }, 150);
  });

  $('glossary').replaceChildren(...LOCAL.glossary.map(([term, def]) => {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = def;
    const div = document.createElement('div'); div.append(dt, dd);
    return div;
  }));
  if (LOCAL.credit) $('local-credit').textContent = `From the tidal key on ${LOCAL.credit}'s map of Flamborough Head.`;

  readColors();
  sizeCanvas();
  renderFeatures();
  render();
  requestAnimationFrame(frame);

  fetch(CONFIG.tidesUrl || 'data/tides.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      loadTides(j);
      if (!tideData) return;
      $('now').disabled = false;
      $('now').title = 'Jump to the state of the tide now';
      const now = Date.now();
      const highs = tideData.highs;
      if (state.hwMinutes == null && now > highs[0].ms - 6 * HOUR_MS && now < highs.at(-1).ms + 6 * HOUR_MS) setAbsolute(now);
      else render();
    })
    .catch(() => {});
})();
