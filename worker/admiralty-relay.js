// Cloudflare Worker: relays ADMIRALTY UK Tidal API predictions for Bridlington
// to the map without exposing the subscription key.
//
// The Discovery subscription does not allow storing or caching predictions,
// so this worker keeps nothing: every request is passed straight through to
// the API and the response is marked no-store.
//
// Setup (Cloudflare dashboard): Workers & Pages -> Create -> Worker, paste this
// file, Deploy. Then Settings -> Variables and secrets -> add a Secret named
// ADMIRALTY_API_KEY holding your primary key. Optionally add a plain variable
// ALLOWED_ORIGIN (default below) for the site allowed to call it.
//
// GET /tides -> { station, source, events: [{ type: 'HW'|'LW', time, height }] }
//   time is ISO UTC ("2026-10-20T05:12Z"), height is metres above chart datum.

const API = 'https://admiraltyapi.azure-api.net/uktidalapi/api/V1';
const STATION_NAME = 'Bridlington';
const DEFAULT_ORIGIN = 'https://pocoyo-roe.github.io';

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || DEFAULT_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== '/tides') return new Response('{"error":"not found"}', { status: 404, headers: cors });
    if (!env.ADMIRALTY_API_KEY) return new Response('{"error":"ADMIRALTY_API_KEY secret not set"}', { status: 500, headers: cors });

    const api = (path) => fetch(`${API}${path}`, {
      headers: { 'Ocp-Apim-Subscription-Key': env.ADMIRALTY_API_KEY },
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    try {
      // Look Bridlington up in the full station list.
      const st = await api('/Stations');
      if (!st.ok) throw new Error(`stations ${st.status}`);
      const stations = await st.json();
      const feature = (stations.features || []).find((f) => (f.properties?.Name || '').toLowerCase() === STATION_NAME.toLowerCase());
      if (!feature) throw new Error('Bridlington station not found');
      const id = feature.properties.Id;

      const ev = await api(`/Stations/${encodeURIComponent(id)}/TidalEvents?duration=7`);
      if (!ev.ok) throw new Error(`tidal events ${ev.status}`);
      const raw = await ev.json();
      const events = raw
        .filter((e) => e.EventType === 'HighWater' || e.EventType === 'LowWater')
        .map((e) => ({
          type: e.EventType === 'HighWater' ? 'HW' : 'LW',
          // the API gives GMT without a zone marker
          time: `${e.DateTime.slice(0, 16)}Z`,
          height: Math.round(e.Height * 100) / 100,
        }));

      return new Response(JSON.stringify({
        station: { id, name: feature.properties.Name },
        source: 'ADMIRALTY UK Tidal API',
        copyright: '© Crown copyright, UK Hydrographic Office',
        datum: 'metres above chart datum',
        fetchedAt: new Date().toISOString().slice(0, 16) + 'Z',
        events,
      }), { headers: cors });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err.message || err) }), { status: 502, headers: cors });
    }
  },
};
