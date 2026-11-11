"""Build The Parcel Problem's data from the cached MassGIS downloads.

Writes, under pieces/parcel-problem/data/:
- towns.topojson: the 351 towns (EPSG:26986) with id, name, n (fee and tax parcels), fresh
  (share of parcels edited in 2023 or later) and last (latest edit date, YYYYMMDD).
- parcels.topojson: Westborough's fee and tax parcels with loc, year and edit.
- stats.json: statewide totals and bands, the town-freshness buckets and the Westborough summary.
"""
from __future__ import annotations

import collections
import datetime
import json
import pathlib
import subprocess
import sys
import zipfile

import geopandas as gpd
import numpy as np

from download import BANDS, CACHE, TOWN_ID, parse_grouped

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DATA = HERE.parent / "data"
RUN_DATE = 20261110
QUANTIZATION = 1e5
TOWN_TOLERANCE_M = 60
PARCEL_TOLERANCE_M = 1
FRESH_BANDS = ("2023to2024", "2025on")
CUTOFF = 20230101  # the one date window the film uses for "recent" edits
BATCH_MIN = 20  # the nightly example is the latest edit date with at least this many records


def edit_year(v) -> int | None:
    """Year of a LAST_EDIT value (YYYYMMDD); None for missing or zero."""
    if v is None or (isinstance(v, float) and np.isnan(v)) or int(v) <= 0:
        return None
    return int(v) // 10000


def clamp_date(v: int) -> int:
    """A date after the run date is a data error; the run date stands in for it."""
    return min(int(v), RUN_DATE)


def freshness(bands: dict[str, int]) -> float | None:
    total = sum(bands.values())
    if total == 0:
        return None
    return sum(bands.get(b, 0) for b in FRESH_BANDS) / total


def town_rows(towns: gpd.GeoDataFrame, stats: dict[int, dict], bands: dict[str, dict[int, int]]) -> gpd.GeoDataFrame:
    """One row per town in the boundary file, even when the service returned nothing for it."""
    ids = towns["TOWN_ID"].astype(int)
    n = [int(stats.get(i, {}).get("n", 0) or 0) for i in ids]
    fresh = []
    last = []
    for i, count in zip(ids, n):
        recent = sum(bands.get(b, {}).get(i, 0) for b in FRESH_BANDS)
        fresh.append(recent / count if count > 0 else np.nan)
        le = stats.get(i, {}).get("last_edit")
        last.append(clamp_date(le) if le else None)
    out = gpd.GeoDataFrame(
        {
            "id": ids.to_numpy(),
            "name": [str(t).title() for t in towns["TOWN"]],
            "n": n,
            "fresh": fresh,
            "last": last,
        },
        geometry=towns.geometry.values,
        crs=towns.crs,
    )
    return out.reset_index(drop=True)


def write_topojson(gdf: gpd.GeoDataFrame, path: pathlib.Path, object_name: str, quantization: float, tolerance_m: float) -> None:
    """Write `gdf` (already projected) as TopoJSON through scripts/topo.mjs: shared arcs,
    Visvalingam simplification on those arcs at `tolerance_m`, then quantization."""
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    geojson = path.with_suffix(".geojson.tmp")
    gdf.to_file(geojson, driver="GeoJSON")
    try:
        subprocess.run(
            ["node", str(ROOT / "scripts" / "topo.mjs"), str(geojson), str(path), str(quantization), str(tolerance_m), object_name],
            check=True,
            shell=False,
        )
    finally:
        geojson.unlink(missing_ok=True)


def load_towns() -> gpd.GeoDataFrame:
    folder = CACHE / "townssurvey"
    shp = folder / "TOWNSSURVEY_POLYM.shp"
    if not shp.exists():
        with zipfile.ZipFile(CACHE / "townssurvey_shp.zip") as z:
            z.extractall(folder)
    towns = gpd.read_file(shp)
    assert towns.crs is not None and towns.crs.to_epsg() == 26986, towns.crs
    return towns


def load_grouped(name: str) -> dict[int, dict]:
    return parse_grouped(json.loads((CACHE / f"{name}.json").read_text(encoding="utf-8")))


def load_parcels() -> gpd.GeoDataFrame:
    g = gpd.read_file(CACHE / f"parcels_{TOWN_ID}.geojson")
    g = g.set_crs(26986, allow_override=True)
    out = gpd.GeoDataFrame(
        {
            "loc": g["LOC_ID"].astype(str),
            "year": [edit_year(v) for v in g["LAST_EDIT"]],
            "edit": [clamp_date(v) if edit_year(v) else None for v in g["LAST_EDIT"]],
        },
        geometry=g.geometry.values,
        crs=g.crs,
    )
    return out.reset_index(drop=True)


def fresh_bucket(f: float) -> str:
    if f < 0.05:
        return "under5"
    if f < 0.20:
        return "5to20"
    if f < 0.50:
        return "20to50"
    return "over50"


def build_stats(towns: gpd.GeoDataFrame, bands: dict[str, dict[int, int]], parcels: gpd.GeoDataFrame, town_name: str) -> dict:
    statewide = {b.name: int(sum(bands.get(b.name, {}).values())) for b in BANDS}
    statewide["unknown"] = int(towns["n"].sum()) - sum(statewide.values())
    buckets = collections.Counter(fresh_bucket(f) for f in towns["fresh"] if not np.isnan(f))
    years = collections.Counter(int(y) for y in parcels["year"] if y is not None)
    edits = [int(e) for e in parcels["edit"] if e is not None]
    latest = max(edits)
    on_latest = int((parcels["edit"] == latest).sum())
    # The nightly example is the latest edit date that carries a real batch (20 records or more).
    by_date = collections.Counter(edits)
    batch_date = max((d for d, n in by_date.items() if n >= BATCH_MIN), default=latest)
    batch_rows = parcels[parcels["edit"] == batch_date].sort_values("loc").drop_duplicates("loc")
    run_day = datetime.date(batch_date // 10000, batch_date // 100 % 100, batch_date % 100) + datetime.timedelta(days=1)
    return {
        "run": f"{RUN_DATE // 10000}-{RUN_DATE // 100 % 100:02d}-{RUN_DATE % 100:02d}",
        "towns": int(len(towns)),
        "parcels": int(towns["n"].sum()),
        "bands": statewide,
        "townsBy": {"fresh": {k: int(buckets.get(k, 0)) for k in ("under5", "5to20", "20to50", "over50")}},
        "town": {
            "id": TOWN_ID,
            "name": town_name,
            "n": int(len(parcels)),
            "first": min(edits),
            "last": latest,
            "years": {str(k): int(v) for k, v in sorted(years.items())},
            "latest": {"date": latest, "count": on_latest},
            "since2023": int((parcels["edit"] >= CUTOFF).sum()),
            "batch": {"date": int(batch_date), "count": int(by_date[batch_date]), "run": run_day.isoformat()},
            "sample": [{"loc": r.loc, "edit": int(r.edit)} for r in batch_rows.head(7).itertuples()],
        },
    }


def main() -> int:
    towns_raw = load_towns()
    stats = load_grouped("town_stats")
    bands = {b.name: {k: int(v["n"]) for k, v in load_grouped(f"band_{b.name}").items()} for b in BANDS}
    towns = town_rows(towns_raw, stats, bands)
    DATA.mkdir(parents=True, exist_ok=True)
    write_topojson(towns, DATA / "towns.topojson", "towns", QUANTIZATION, TOWN_TOLERANCE_M)

    parcels = load_parcels()
    write_topojson(parcels, DATA / "parcels.topojson", "parcels", QUANTIZATION, PARCEL_TOLERANCE_M)

    town_name = towns.loc[towns["id"] == TOWN_ID, "name"].item()
    out = build_stats(towns, bands, parcels, town_name)
    (DATA / "stats.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    for p in sorted(DATA.iterdir()):
        print(f"{p.name}: {p.stat().st_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
