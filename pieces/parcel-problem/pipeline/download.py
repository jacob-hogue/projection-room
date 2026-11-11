"""Fetch and cache The Parcel Problem's data. Nothing here is committed; see README.

Sources (both public, published by MassGIS):
- Massachusetts Property Tax Parcels feature service: statistics grouped by town, and the
  polygons of one town (Westborough, TOWN_ID 328) paginated 2,000 rows at a time.
- Community Boundaries (Towns) from Survey Points, shapefile.
"""
from __future__ import annotations

import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Callable

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parent.parent.parent / ".cache" / "parcel-problem"
UA = "projection-room-parcel-problem/0.1 (https://jacob-hogue.github.io/projection-room/)"

SERVICE = "https://services1.arcgis.com/hGdibHYSPO59RG1h/arcgis/rest/services/Massachusetts_Property_Tax_Parcels/FeatureServer/0/query"
TOWNS_ZIP = "https://s3.us-east-1.amazonaws.com/download.massgis.digital.mass.gov/shapefiles/state/townssurvey_shp.zip"
TOWN_ID = 328  # Westborough
PAGE = 2000
FEE_TAX = "POLY_TYPE IN ('FEE','TAX')"


@dataclass(frozen=True)
class Band:
    """A range of LAST_EDIT dates (YYYYMMDD), lo inclusive, hi exclusive; None is open."""

    name: str
    lo: int | None
    hi: int | None


BANDS = [
    Band("before2015", None, 20150101),
    Band("2015to2019", 20150101, 20200101),
    Band("2020to2022", 20200101, 20230101),
    Band("2023to2024", 20230101, 20250101),
    Band("2025on", 20250101, None),
]


def band_where(band: Band) -> str:
    parts = [FEE_TAX]
    if band.lo is not None:
        parts.append(f"LAST_EDIT >= {band.lo}")
    if band.hi is not None:
        parts.append(f"LAST_EDIT < {band.hi}")
    return " AND ".join(parts)


RETRIES = 6


def get(params: dict[str, str]) -> bytes:
    """One service query, retried with backoff: the service answers some valid queries with
    a 400 "Unable to perform query" and succeeds on the next try."""
    url = SERVICE + "?" + urllib.parse.urlencode(params)
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as r:
                body = r.read()
            raw = json.loads(body)
            if "error" not in raw:
                return body
            last = raw["error"]
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"feature service error after {RETRIES} tries: {last}")


def cached(name: str, make: Callable[[], bytes]) -> pathlib.Path:
    dest = CACHE / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not (dest.exists() and dest.stat().st_size > 0):
        dest.write_bytes(make())
    return dest


def grouped(name: str, where: str, stats: list[dict]) -> pathlib.Path:
    """Statistics grouped by TOWN_ID, cached as <name>.json."""
    return cached(
        f"{name}.json",
        lambda: get(
            {
                "where": where,
                "groupByFieldsForStatistics": "TOWN_ID",
                "outStatistics": json.dumps(stats),
                "f": "pjson",
            }
        ),
    )


def parse_grouped(raw: dict) -> dict[int, dict]:
    if "error" in raw:
        raise RuntimeError(f"feature service error: {raw['error']}")
    return {f["attributes"]["TOWN_ID"]: f["attributes"] for f in raw["features"]}


def pages(fetch: Callable[[int], list], page_size: int) -> list:
    """Walk offsets until a page comes back shorter than page_size."""
    out: list = []
    offset = 0
    while True:
        page = fetch(offset)
        out.extend(page)
        if len(page) < page_size:
            return out
        offset += page_size


def town_parcels(town_id: int) -> pathlib.Path:
    def fetch(offset: int) -> list:
        raw = json.loads(
            get(
                {
                    "where": f"TOWN_ID = {town_id} AND {FEE_TAX}",
                    "outFields": "LOC_ID,LAST_EDIT,POLY_TYPE",
                    "outSR": "26986",
                    "orderByFields": "OBJECTID",
                    "f": "geojson",
                    "resultRecordCount": str(PAGE),
                    "resultOffset": str(offset),
                }
            )
        )
        return raw["features"]

    def make() -> bytes:
        return json.dumps({"type": "FeatureCollection", "features": pages(fetch, PAGE)}).encode("utf-8")

    return cached(f"parcels_{town_id}.geojson", make)


def fetch_file(url: str, name: str) -> pathlib.Path:
    def make() -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=600) as r:
            return r.read()

    return cached(name, make)


COUNT = {"statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "n"}


def main() -> int:
    paths = [
        fetch_file(TOWNS_ZIP, "townssurvey_shp.zip"),
        grouped(
            "town_stats",
            FEE_TAX,
            [
                COUNT,
                {"statisticType": "max", "onStatisticField": "FY", "outStatisticFieldName": "fy"},
                {"statisticType": "max", "onStatisticField": "LAST_EDIT", "outStatisticFieldName": "last_edit"},
                {"statisticType": "min", "onStatisticField": "LAST_EDIT", "outStatisticFieldName": "first_edit"},
            ],
        ),
        *[grouped(f"band_{b.name}", band_where(b), [COUNT]) for b in BANDS],
        town_parcels(TOWN_ID),
    ]
    for p in paths:
        print(f"{p.name}: {p.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
