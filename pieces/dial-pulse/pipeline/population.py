"""1950 population of each 1947 area code territory.

Counties (Census cartographic boundaries, 2024) are assigned to the 1947 territory that
contains their representative point (or the nearest territory within 50 km, for coastal
counties whose point falls just off the clipped coast), and their 1950 counts are summed.
Counts come from the Census Bureau's "Population of Counties by Decennial Census: 1900 to
1990" (Richard Forstall, 1995), in the CSV copy NBER publishes.

Two kinds of mismatch between 1950 and 2024 counties are handled:
- RECODED maps 1950 county codes that no longer exist to the county or city that holds that
  land today (Dade to Miami-Dade; the Virginia counties absorbed by independent cities).
- STATE_FILL gives a territory the 1950 state total when its 2024 units are unknown to the
  1950 table. Connecticut's counties were replaced by planning regions in 2022.
Counties created after 1950 (La Paz, Broomfield, Cibola, Menominee and the newer Virginia
cities) have no 1950 row; their 1950 people are already counted in the county they came from.

Output: data/population_1950.csv (code, population_1950, counties, source) and a report of
counties outside every territory, counties without a 1950 count, and territories filled
from a state total.
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys
import zipfile

import geopandas as gpd

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parent.parent.parent / ".cache"
DATA = HERE.parent / "data"
SOURCE = "https://data.nber.org/census/population/cencounts/cencounts.csv"
NEAREST_M = 50_000

# 1950 FIPS -> the 2024 unit that holds that land.
RECODED = {
    "12025": "12086",  # Dade County -> Miami-Dade County (1997)
    "46113": "46102",  # Shannon County -> Oglala Lakota County (2015)
    "51055": "51650",  # Elizabeth City County -> Hampton city (1952)
    "51123": "51800",  # Nansemond County -> Suffolk city (1974)
    "51129": "51550",  # Norfolk County -> Chesapeake city (1963)
    "51151": "51810",  # Princess Anne County -> Virginia Beach city (1963)
    "51189": "51700",  # Warwick County -> Newport News city (1958)
    "51560": "51005",  # Clifton Forge city -> Alleghany County (2001)
    "51780": "51083",  # South Boston city -> Halifax County (1995)
}

# Territory code -> state FIPS whose 1950 total stands in for unknown county units.
STATE_FILL = {"203": "09"}


def _rows(path: pathlib.Path):
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            fips = r["fips"].strip()
            value = r["pop1950"].strip()
            # A county that did not exist in 1950 carries "." in that column.
            if len(fips) == 5 and value.isdigit():
                yield fips, int(value)


def county_populations(path: pathlib.Path) -> dict[str, int]:
    """1950 count by five-digit FIPS, counties only (state and national rows end in 000)."""
    out: dict[str, int] = {}
    for fips, value in _rows(path):
        if fips.endswith("000"):
            continue
        key = RECODED.get(fips, fips)
        out[key] = out.get(key, 0) + value
    return out


def state_totals(path: pathlib.Path) -> dict[str, int]:
    """1950 count by two-digit state FIPS."""
    return {fips[:2]: value for fips, value in _rows(path) if fips.endswith("000") and fips != "00000"}


def population_by_original(originals: gpd.GeoDataFrame, counties: gpd.GeoDataFrame, pops: dict[str, int],
                           totals: dict[str, int] | None = None, nearest_m: float = NEAREST_M):
    """Sum county counts inside each territory. Returns (DataFrame, report)."""
    pts = counties[["GEOID", "geometry"]].copy()
    pts["geometry"] = pts.representative_point()
    if pts.crs != originals.crs:
        pts = pts.to_crs(originals.crs)
    terr = originals[["original", "geometry"]]
    joined = gpd.sjoin(pts, terr, how="left", predicate="within")
    unmatched = joined[joined["original"].isna()][["GEOID", "geometry"]]
    if len(unmatched) and nearest_m > 0:
        near = gpd.sjoin_nearest(unmatched, terr, how="left", max_distance=nearest_m)
        near = near[~near.index.duplicated()]
        joined.loc[near.index, "original"] = near["original"]
    outside = sorted(joined[joined["original"].isna()]["GEOID"].astype(str))
    inside = joined[joined["original"].notna()].copy()
    inside["pop"] = inside["GEOID"].map(pops)
    missing = sorted(inside[inside["pop"].isna()]["GEOID"].astype(str))
    counted = inside[inside["pop"].notna()]
    grouped = counted.groupby("original").agg(population_1950=("pop", "sum"), counties=("GEOID", "count")).reset_index()
    grouped = grouped.rename(columns={"original": "code"})
    all_codes = originals["original"].astype(str).tolist()
    grouped = grouped.set_index("code").reindex(all_codes, fill_value=0).rename_axis("code").reset_index()
    filled: list[str] = []
    for code, state in STATE_FILL.items():
        if code in all_codes and totals and state in totals:
            grouped.loc[grouped["code"] == code, ["population_1950", "counties"]] = [totals[state], 0]
            filled.append(code)
    grouped["population_1950"] = grouped["population_1950"].astype(int)
    grouped["counties"] = grouped["counties"].astype(int)
    return grouped, {"counties_outside": outside, "counties_without_population": missing, "filled_from_state_total": filled}


def main() -> int:
    inner = [n for n in zipfile.ZipFile(CACHE / "cb_2024_us_county_500k.zip").namelist() if n.endswith(".shp")][0]
    counties = gpd.read_file(f"/vsizip/{(CACHE / 'cb_2024_us_county_500k.zip').as_posix()}/{inner}", columns=["GEOID"])
    originals = gpd.read_file(DATA / "originals_1947.geojson")
    if originals.crs is None:
        originals = originals.set_crs(5070)
    pops = county_populations(CACHE / "cencounts.csv")
    totals = state_totals(CACHE / "cencounts.csv")
    out, report = population_by_original(originals, counties.to_crs(originals.crs), pops, totals)
    out["source"] = SOURCE
    out.to_csv(DATA / "population_1950.csv", index=False)
    (DATA / "population_1950_report.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    total = int(out["population_1950"].sum())
    print(f"population_1950.csv: {len(out)} territories, {total:,} people; "
          f"{len(report['counties_outside'])} counties outside, {len(report['counties_without_population'])} without a 1950 count, "
          f"filled from state totals: {report['filled_from_state_total']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
