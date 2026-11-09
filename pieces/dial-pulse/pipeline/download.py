"""Fetch and cache the dial-pulse map's sources. Nothing here is committed; see README.

Sources (all public domain):
- Area code polygons, 2015: 1ec5/nanp-boundaries, republished from the UCLA Geoportal
  dataset "North America Telephone Area Code Boundaries" (October 14, 2015).
- Natural Earth 1:10m admin-1 states and provinces, and lakes.
- Census TIGER/Line 2024 cartographic county boundaries (1:500k).
- NANPA NPA report (daily CSV), used by draft_lineage.py.
"""
from __future__ import annotations

import pathlib
import sys
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parent.parent.parent / ".cache"
UA = "projection-room-dial-pulse/0.1 (https://jacob-hogue.github.io/projection-room/)"

SOURCES = {
    "area-codes.geojson": "https://raw.githubusercontent.com/1ec5/nanp-boundaries/main/area-codes.geojson",
    "ne_states.zip": "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip",
    "ne_lakes.zip": "https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.zip",
    "cb_2024_us_county_500k.zip": "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip",
    "npa_report.csv": "https://reports.nanpa.com/public/npa_report.csv",
    "cencounts.csv": "https://data.nber.org/census/population/cencounts/cencounts.csv",
}


def fetch(url: str, dest: pathlib.Path) -> pathlib.Path:
    """Download url to dest unless dest already exists and is non-empty."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    return dest


def main() -> int:
    for name, url in SOURCES.items():
        path = fetch(url, CACHE / name)
        print(f"{name}: {path.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
