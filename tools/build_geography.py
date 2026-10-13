#!/usr/bin/env python3
"""Build data/coastline.js and data/local-names.js.

Coastline: the GSHHG full-resolution shoreline (Wessel & Smith, LGPL), as
shipped in the basemap-data-hires package, clipped to Flamborough Head and
lightly smoothed to remove its grid staircase.

    pip download basemap-data-hires --no-deps -d /tmp/bm
    (unzip the wheel, then)
    python3 tools/build_geography.py path/to/gshhsmeta_f.dat path/to/gshhs_f.dat

Local names: from D. J. Lythgoe's hand-drawn map of the headland. That map is
not to scale, so each name keeps its order and relative spacing along the
coast, and is pinned to the real shoreline between control points whose
positions are known (the two landings, Selwicks Bay, the head end, Thornwick).
Positions are approximate, to within a couple of hundred metres.
"""
import array
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOX = (-0.45, 0.25, 53.9, 54.32)  # W, E, S, N

# Local names in order along the coast, from Bempton round the head to South
# Landing, with where each label's leader meets the coast on a 2000x1500 photo
# of the map. `kind` is "rock" for features offshore of the cliff foot.
NAMES = [
    ('Old Roll Up', 265, 18), ('Black Shelf', 330, 40), ('Mossy Shelves', 365, 65),
    ('Staple Newk', 390, 80), ('Side Brays', 410, 95), ('Old Dore', 480, 120),
    ('Stone Hole Mouth', 490, 135), ('Little Dore', 535, 165), ('Wandale Nab', 570, 195),
    ('Blacksmith Shop', 625, 235), ('Pinnacle', 665, 240), ('Billiard Table', 725, 265),
    ('Cat Nab', 745, 290), ('Dyke End', 760, 310), ('White Corner', 790, 340),
    ('Gull Newks', 800, 335), ('Bottle Neck', 835, 372), ('Close Newks', 855, 378),
    ('Sanwick Brigg', 915, 420), ('Sanwick Langness', 1040, 460), ('Amphitheatre', 1110, 465),
    ('Chatterthrow', 1060, 510), ('Little Thornwick', 1075, 530), ('White Cliff', 1120, 550),
    ('Thornwick Scar', 1150, 475), ('Smugglers', 1170, 500), ('Church Cave', 1190, 505),
    ('West Scar', 1240, 535), ('Joe Whitley Hole', 1250, 520), ('Gort', 1230, 580),
    ('Horse Hole', 1240, 600), ('Old Lifeboat House', 1255, 610), ('Robin Lythes Hole', 1295, 550),
    ('East Scar', 1290, 565), ('Five Arches', 1320, 570), ('Newcombe', 1330, 600),
    ('Cooness', 1290, 635), ('Carter Lane', 1370, 630), ('Panniman Scars', 1300, 660),
    ('Saddles', 1330, 700), ('King Rock', 1410, 700, 'rock'), ('Breil Newk', 1420, 730),
    ('Petrel Hole', 1460, 735), ('Breil Flats', 1465, 755), ('Breil Head', 1480, 800),
    ('Butchers Shop', 1515, 840), ('Cradle Head', 1550, 805), ('Swineshaw Hole', 1545, 825),
    ('Fall Hole', 1500, 860), ('Scout Hole', 1585, 860), ('West Newk', 1580, 880),
    ('Stottlebink', 1605, 880), ('East Newk', 1605, 900), ('Limekilns', 1600, 925),
    ('Kindle Scar', 1595, 960), ('Molk Hole', 1550, 990), ('Adam', 1605, 985),
    ('Common Hole', 1660, 985), ('Churchyard Cave', 1650, 1000), ('Pigeon Hole', 1620, 1010),
    ('Gun House', 1630, 1030), ('Mathon Sands', 1670, 1025), ('Greenstacks', 1700, 1035),
    ('Green Stacks Pinnacle', 1680, 1050), ('Stacks Pinnacle', 1690, 1070), ('Gutters', 1710, 1085),
    ('Hedge Newk', 1650, 1090), ('Cattlemere Hole', 1620, 1105), ('Drever Dock', 1590, 1125),
    ('Truckway', 1580, 1150), ('Old Fall', 1520, 1150), ('New Fall', 1450, 1170),
    ('Galley Dock', 1470, 1185), ('Syke', 1360, 1180), ('Sand Hole', 1300, 1210),
    ('High Sand Hole', 1285, 1220), ('East Newk', 1120, 1255), ('Welk Holes', 1040, 1215, 'rock'),
    ('Quay Hole', 1060, 1170), ('Brigg Hole', 1010, 1150), ('New Lifeboat House', 1000, 1140),
    ('Roger Sellars Rock', 985, 1195, 'rock'), ('West Newk', 980, 1200),
]

# Names whose real positions are known well enough to pin the map to the coast.
CONTROLS = {
    'Little Thornwick': (54.1335, -0.1190),     # Thornwick Bay
    'Old Lifeboat House': (54.1290, -0.1010),   # North Landing
    'Molk Hole': (54.1208, -0.0792),            # Selwicks Bay
    'Stacks Pinnacle': (54.1167, -0.0759),      # the head end
    'New Lifeboat House': (54.1037, -0.1180),   # South Landing
}


def read_gshhs(meta, dat):
    """Return the shoreline inside BOX as a list of [lat, lon], in ring order."""
    W, E, S, N = BOX
    with open(dat, 'rb') as f:
        for line in open(meta):
            p = line.split()
            typ, south, north, off, nbytes = int(p[0]), float(p[3]), float(p[4]), int(p[5]), int(p[6])
            if typ != 1 or south > N or north < S:
                continue
            f.seek(off)
            a = array.array('f')
            a.frombytes(f.read(nbytes))
            pts = list(zip(a[1::2], a[0::2]))  # (lat, lon)
            idx = [i for i, (y, x) in enumerate(pts) if W < x < E and S < y < N]
            if idx:
                return pts[idx[0]:idx[-1] + 1]
    raise SystemExit('no shoreline found in box')


def chaikin(pts, rounds=2):
    for _ in range(rounds):
        out = [pts[0]]
        for (a, b) in zip(pts, pts[1:]):
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        out.append(pts[-1])
        pts = out
    return pts


def xy(p):
    """Local metres from a lat/lon pair."""
    return (p[1] * 111320 * math.cos(math.radians(54.1)), p[0] * 111320)


def simplify(pts, tol_m):
    """Douglas-Peucker in metres."""
    if len(pts) < 3:
        return pts
    a, b = xy(pts[0]), xy(pts[-1])
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        p = xy(pts[i])
        d = abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / L
        if d > best:
            best, bi = d, i
    if best <= tol_m:
        return [pts[0], pts[-1]]
    return simplify(pts[:bi + 1], tol_m)[:-1] + simplify(pts[bi:], tol_m)


def arc_lengths(pts):
    s = [0.0]
    for a, b in zip(pts, pts[1:]):
        (ax, ay), (bx, by) = xy(a), xy(b)
        s.append(s[-1] + math.hypot(bx - ax, by - ay))
    return s


def project(pts, s, q):
    """Arc length of the nearest point on the polyline to q."""
    qx, qy = xy(q)
    best = (float('inf'), 0.0)
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        (ax, ay), (bx, by) = xy(a), xy(b)
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1e-9
        t = max(0.0, min(1.0, ((qx - ax) * dx + (qy - ay) * dy) / L2))
        d = math.hypot(ax + t * dx - qx, ay + t * dy - qy)
        if d < best[0]:
            best = (d, s[i] + t * math.sqrt(L2))
    return best[1]


def point_at(pts, s, target):
    """Point and seaward normal on the polyline at arc length target."""
    for i in range(len(s) - 1):
        if s[i + 1] >= target:
            t = (target - s[i]) / ((s[i + 1] - s[i]) or 1e-9)
            a, b = pts[i], pts[i + 1]
            lat, lon = a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])
            (ax, ay), (bx, by) = xy(a), xy(b)
            L = math.hypot(bx - ax, by - ay) or 1e-9
            # The shoreline runs with land on the right (GSHHG rings run
            # clockwise), so the sea is on the left of the direction of travel.
            nx, ny = -(by - ay) / L, (bx - ax) / L
            return lat, lon, nx, ny
    return pts[-1][0], pts[-1][1], 0, 0


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    raw = read_gshhs(sys.argv[1], sys.argv[2])
    coast = simplify(chaikin(raw), 10)
    s = arc_lengths(coast)

    # Orientation check: the sea must be to the left of travel. Test with a point
    # known to be at sea (the race off the head end).
    i = min(range(len(coast)), key=lambda k: abs(coast[k][0] - 54.117) + abs(coast[k][1] + 0.0759))
    lat, lon, nx, ny = point_at(coast, s, s[i])
    if nx < 0:
        raise SystemExit('unexpected ring orientation')

    # Land polygon: shoreline plus inland corners.
    land = [[round(a, 5), round(b, 5)] for a, b in coast]
    land = [[54.32, -0.6]] + land + [[53.9, -0.6]]

    # Chain distance along the hand-drawn coast, in photo pixels.
    chain = [0.0]
    for a, b in zip(NAMES, NAMES[1:]):
        chain.append(chain[-1] + math.hypot(b[1] - a[1], b[2] - a[2]))
    names = [n[0] for n in NAMES]
    ctrl = sorted((names.index(k), project(coast, s, v)) for k, v in CONTROLS.items())

    def real_arc(k):
        # Interpolate between the controls either side; past the ends, extrapolate
        # with the scale of the nearest pair.
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
        off = 120 if len(n) > 3 and n[3] == 'rock' else 25  # metres seaward
        lat += ny * off / 111320
        lon += nx * off / (111320 * math.cos(math.radians(lat)))
        placed.append({'name': n[0], 'lat': round(lat, 5), 'lon': round(lon, 5),
                       **({'kind': n[3]} if len(n) > 3 else {})})

    (ROOT / 'data/coastline.js').write_text(
        '// Land outline around Flamborough Head, as [lat, lon] pairs, for the drawn\n'
        '// chart base map and to keep flow particles off the land.\n'
        '// Shoreline: GSHHG full resolution (Wessel & Smith, LGPL), smoothed.\n'
        '// Generated by tools/build_geography.py.\n'
        f'window.LAND_OUTLINE = {json.dumps(land, separators=(",", ":"))};\n')
    (ROOT / 'data/local-names.js').write_text(
        "// Local names for the headland's coves, rocks and cliffs, from D. J. Lythgoe's\n"
        '// hand-drawn map. Positions are approximate (within a couple of hundred metres).\n'
        '// Generated by tools/build_geography.py.\n'
        f'window.LOCAL_NAMES = {json.dumps(placed, indent=1)};\n')
    print(f'coastline: {len(raw)} -> {len(coast)} points; {len(placed)} local names')
    for n in placed:
        if n['name'] in ('Staple Newk', 'Old Roll Up', 'Breil Head', 'Cattlemere Hole', 'Sanwick Brigg', 'West Newk'):
            print('  ', n)


if __name__ == '__main__':
    main()
