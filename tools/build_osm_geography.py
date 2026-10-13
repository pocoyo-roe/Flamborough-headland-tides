#!/usr/bin/env python3
"""Build the map's geography from OpenStreetMap (© OpenStreetMap contributors,
ODbL): data/osm/flamborough.json, fetched by .github/workflows/fetch-osm.yml.

Writes:
  data/coastline.js     window.LAND_OUTLINE (mainland) and window.LAND_ISLETS
                        (stacks and islets), from natural=coastline, i.e. the
                        mean high water line
  data/intertidal.js    window.INTERTIDAL: rock scars and sand that dry at low
                        water, plus cliff lines
  data/local-names.js   Lythgoe's local names placed on the new coastline, using
                        any names OSM also has as extra control points

Usage: python3 tools/build_osm_geography.py
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_geography import NAMES, CONTROLS, arc_lengths, point_at, project, simplify, xy  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data/osm/flamborough.json'
BOX = (53.97, -0.36, 54.26, 0.02)  # S, W, N, E: the map's land mask area
TOL_M = 2.0  # simplification tolerance in metres

ROCK = {'reef', 'bare_rock', 'rock', 'stone', 'stack'}
SAND = {'beach', 'sand', 'shingle', 'shoal', 'mud'}
NAMED = {'bay', 'cape', 'peninsula', 'cave_entrance', 'arch', 'stack', 'reef', 'rock', 'bare_rock', 'strait', 'beach', 'cliff'}


def norm(name):
    """Comparable form of a place name: 'Robin Lythe's Hole' -> 'robinlytheshole'."""
    return re.sub(r'[^a-z]', '', name.lower().replace('nook', 'newk'))


def way_coords(el):
    return [(p['lat'], p['lon']) for p in el.get('geometry', []) if p]


def join_ways(ways):
    """Join coastline ways end to end by node id into chains."""
    by_start = {w['nodes'][0]: w for w in ways}
    used, chains = set(), []
    for w in ways:
        if w['id'] in used:
            continue
        # walk back to the start of this chain
        start = w
        ends = {x['nodes'][-1]: x for x in ways}
        seen = {start['id']}
        while start['nodes'][0] in ends and ends[start['nodes'][0]]['id'] not in seen and ends[start['nodes'][0]]['id'] not in used:
            start = ends[start['nodes'][0]]
            seen.add(start['id'])
        chain, cur = [], start
        while cur and cur['id'] not in used:
            used.add(cur['id'])
            pts = way_coords(cur)
            chain.extend(pts if not chain else pts[1:])
            cur = by_start.get(cur['nodes'][-1])
        chains.append(chain)
    return chains


def rings_of(el):
    """Outer rings of a closed way or multipolygon relation."""
    if el['type'] == 'way':
        pts = way_coords(el)
        return [pts] if len(pts) > 3 and pts[0] == pts[-1] else []
    if el['type'] == 'relation':
        outers = [m for m in el.get('members', []) if m.get('role') in ('outer', '') and m.get('geometry')]
        segs = [[(p['lat'], p['lon']) for p in m['geometry']] for m in outers]
        rings = []
        while segs:
            ring = segs.pop(0)
            changed = True
            while ring[0] != ring[-1] and changed:
                changed = False
                for i, sg in enumerate(segs):
                    if sg[0] == ring[-1]:
                        ring += sg[1:]
                    elif sg[-1] == ring[-1]:
                        ring += sg[::-1][1:]
                    else:
                        continue
                    segs.pop(i)
                    changed = True
                    break
            if ring[0] == ring[-1] and len(ring) > 3:
                rings.append(ring)
        return rings
    return []


def inside(p):
    S, W, N, E = BOX
    return S < p[0] < N and W < p[1] < E


def rnd(pts):
    return [[round(a, 6), round(b, 6)] for a, b in pts]


def main():
    data = json.loads(SRC.read_text())
    els = data['elements']
    coast_ways = [e for e in els if e['type'] == 'way' and e.get('tags', {}).get('natural') == 'coastline']
    if not coast_ways:
        raise SystemExit('no coastline in the OSM file')

    # Mainland: the longest chain, cut to the part inside the box. OSM draws
    # the coastline with land on the left, which on this coast runs south to
    # north; reverse it so it runs north to south like the old outline.
    chains = join_ways(coast_ways)
    islets = [c for c in chains if len(c) > 3 and c[0] == c[-1] and len(c) < 2000]
    main_chain = max((c for c in chains if not (c[0] == c[-1] and len(c) < 2000)), key=len)
    idx = [i for i, p in enumerate(main_chain) if inside(p)]
    seg = main_chain[idx[0]:idx[-1] + 1]
    if seg[0][0] < seg[-1][0]:
        seg = seg[::-1]
    coast = simplify(seg, TOL_M)
    land = [[54.32, -0.6]] + rnd(coast) + [[53.9, -0.6]]
    islet_rings = [rnd(simplify(r, TOL_M / 2)) for r in islets if any(inside(p) for p in r)]

    # Intertidal ground and cliffs.
    inter = []
    for e in els:
        t = e.get('tags', {})
        nat = t.get('natural', '')
        kind = None
        if nat in ROCK or (nat == 'bare_rock') or t.get('tidal') == 'yes' and nat in ROCK:
            kind = 'rock'
        elif nat in SAND or t.get('wetland') == 'tidalflat':
            kind = 'sand'
        if kind:
            for r in rings_of(e):
                inter.append({'kind': kind, 'name': t.get('name'), 'ring': rnd(simplify(r, TOL_M / 2))})
    cliffs = [rnd(simplify(way_coords(e), TOL_M)) for e in els
              if e['type'] == 'way' and e.get('tags', {}).get('natural') == 'cliff' and len(e.get('geometry', [])) > 1]

    # Named features OSM knows, as control points for Lythgoe's names.
    osm_named = {}
    for e in els:
        t = e.get('tags', {})
        if 'name' not in t or t.get('natural') not in NAMED:
            continue
        if e['type'] == 'node':
            p = (e['lat'], e['lon'])
        else:
            g = way_coords(e) or [(q['lat'], q['lon']) for m in e.get('members', []) for q in m.get('geometry', [])]
            if not g:
                continue
            p = (sum(a for a, _ in g) / len(g), sum(b for _, b in g) / len(g))
        osm_named[norm(t['name'])] = (t['name'], p)

    s = arc_lengths(coast)
    names = [n[0] for n in NAMES]
    controls = dict(CONTROLS)
    matched = []
    for n in names:
        hit = osm_named.get(norm(n))
        if hit and names.count(n) == 1:
            controls[n] = hit[1]
            matched.append(f'{n} = {hit[0]}')

    # Chain distance along the hand-drawn coast, as in build_geography.py.
    chain = [0.0]
    for a, b in zip(NAMES, NAMES[1:]):
        chain.append(chain[-1] + math.hypot(b[1] - a[1], b[2] - a[2]))
    ctrl = sorted((names.index(k), project(coast, s, v)) for k, v in controls.items())
    # Drop controls that would make the order along the coast run backwards.
    mono = []
    for c in ctrl:
        if not mono or c[1] > mono[-1][1]:
            mono.append(c)
    ctrl = mono

    def real_arc(k):
        pair = (ctrl[0], ctrl[1]) if k <= ctrl[0][0] else (ctrl[-2], ctrl[-1])
        for c0, c1 in zip(ctrl, ctrl[1:]):
            if c0[0] <= k <= c1[0]:
                pair = (c0, c1)
                break
        (i0, a0), (i1, a1) = pair
        return a0 + (chain[k] - chain[i0]) * (a1 - a0) / (chain[i1] - chain[i0])

    placed = []
    for k, n in enumerate(NAMES):
        lat, lon, nx, ny = point_at(coast, s, real_arc(k))
        rock = len(n) > 3 and n[3] == 'rock'
        off = 60 if rock else 10  # metres seaward
        lat += ny * off / 111320
        lon += nx * off / (111320 * math.cos(math.radians(lat)))
        placed.append({'name': n[0], 'lat': round(lat, 6), 'lon': round(lon, 6),
                       **({'kind': n[3]} if len(n) > 3 else {})})

    # Seamarks and the lighthouse, for checking the hand-placed positions.
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'node' and ('smithic' in t.get('name', '').lower() or t.get('man_made') == 'lighthouse'):
            print('  feature:', t.get('name'), t.get('seamark:type') or t.get('man_made'), e['lat'], e['lon'],
                  t.get('seamark:light:character', ''))

    credit = '// © OpenStreetMap contributors, ODbL (openstreetmap.org/copyright).\n// Generated by tools/build_osm_geography.py.\n'
    (ROOT / 'data/coastline.js').write_text(
        '// Land outline around Flamborough Head, as [lat, lon] pairs, for the drawn\n'
        '// chart base map and to keep flow particles off the land. Mean high water\n'
        '// line from OpenStreetMap natural=coastline.\n' + credit +
        f'window.LAND_OUTLINE = {json.dumps(land, separators=(",", ":"))};\n'
        f'window.LAND_ISLETS = {json.dumps(islet_rings, separators=(",", ":"))};\n')
    (ROOT / 'data/intertidal.js').write_text(
        '// Ground that dries at low water round Flamborough Head (rock scars, sand)\n'
        '// and cliff lines, from OpenStreetMap.\n' + credit +
        f'window.INTERTIDAL = {json.dumps({"areas": inter, "cliffs": cliffs}, separators=(",", ":"))};\n')
    (ROOT / 'data/local-names.js').write_text(
        "// Local names for the headland's coves, rocks and cliffs, from D. J. Lythgoe's\n"
        '// hand-drawn map, placed along the OpenStreetMap coastline. Names OSM also\n'
        '// has are pinned to its positions; the rest are interpolated between them.\n'
        '// Generated by tools/build_osm_geography.py.\n'
        f'window.LOCAL_NAMES = {json.dumps(placed, indent=1)};\n')
    print(f'coastline: {len(seg)} -> {len(coast)} points, {len(islet_rings)} islets; '
          f'{sum(a["kind"] == "rock" for a in inter)} rock and {sum(a["kind"] == "sand" for a in inter)} sand areas, '
          f'{len(cliffs)} cliff lines')
    print(f'OSM named features: {len(osm_named)}; matched to local names: {matched}')


if __name__ == '__main__':
    main()
