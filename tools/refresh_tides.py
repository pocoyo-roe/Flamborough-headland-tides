#!/usr/bin/env python3
"""Fetch modelled sea level for Bridlington from the Open-Meteo marine API and
write data/tides.json: the hourly series plus the high and low waters found
in it. The map loads that file on open to set HW Bridlington, springs/neaps
and the clock.

Open-Meteo data is free to reuse with attribution (CC BY 4.0). It is a model,
not the ADMIRALTY predictions: times can be 20-30 minutes and heights
0.2-0.3 m out.

Usage: python3 tools/refresh_tides.py
Then rebuild and republish: node tools/build-artifact.mjs (publishes
data/tides.json as tides.json next to the page).
"""
import datetime
import json
import pathlib
import urllib.request

LAT, LON = 54.08, -0.17  # just off Bridlington harbour
URL = (
    "https://marine-api.open-meteo.com/v1/marine?"
    f"latitude={LAT}&longitude={LON}&hourly=sea_level_height_msl"
    "&cell_selection=sea&timezone=GMT&past_days=1&forecast_days=8"
)


def extrema(times, levels):
    """High and low waters: local extremes of the hourly series, refined with
    a parabola through the three points around each one."""
    out = []
    for i in range(1, len(levels) - 1):
        a, b, c = levels[i - 1], levels[i], levels[i + 1]
        if None in (a, b, c):
            continue
        high, low = b > a and b >= c, b < a and b <= c
        if not (high or low):
            continue
        den = a - 2 * b + c
        off = 0.5 * (a - c) / den if den else 0.0
        t = times[i] + datetime.timedelta(hours=off)
        out.append({
            "type": "HW" if high else "LW",
            "time": t.strftime("%Y-%m-%dT%H:%MZ"),
            "height": round(b - 0.25 * (a - c) * off, 2),
        })
    return out


def main():
    with urllib.request.urlopen(URL, timeout=30) as r:
        raw = json.load(r)
    h = raw["hourly"]
    times = [datetime.datetime.fromisoformat(t) for t in h["time"]]
    levels = h["sea_level_height_msl"]
    out = {
        "source": "Open-Meteo marine API (CC BY 4.0), modelled sea level",
        "place": "Bridlington",
        "lat": raw.get("latitude"), "lon": raw.get("longitude"),
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "datum": "metres above mean sea level",
        "start": times[0].strftime("%Y-%m-%dT%H:%MZ"),
        "hourly": [None if v is None else round(v, 2) for v in levels],
        "events": extrema(times, levels),
    }
    path = pathlib.Path(__file__).resolve().parent.parent / "data" / "tides.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {path}: {len(levels)} hours, {len(out['events'])} high/low waters")


if __name__ == "__main__":
    main()
