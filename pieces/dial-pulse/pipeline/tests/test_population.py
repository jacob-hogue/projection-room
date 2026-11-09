import csv
import pathlib

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import box

from population import county_populations, population_by_original

PIPE = pathlib.Path(__file__).resolve().parents[1]
DATA = PIPE.parent / "data"


def test_county_populations_reads_the_forstall_csv(tmp_path):
    src = tmp_path / "cencounts.csv"
    src.write_text(
        'pop1900,pop1950,"fips","name"\n'
        '76212168,151325798,"00000","US United States"\n'
        '1828697,3061743,"01000","AL Alabama"\n'
        '17915,18186,"01001","AL Autauga County"\n'
        '1,2,"12025","FL Dade County"\n',
        encoding="utf-8",
    )
    pops = county_populations(src)
    assert pops["01001"] == 18186
    assert "01000" not in pops and "00000" not in pops  # state and national rows are not counties
    assert pops["12086"] == 2  # Dade became Miami-Dade (12025 -> 12086) in 1997


def test_population_by_original_sums_counties_inside_each_territory():
    originals = gpd.GeoDataFrame(
        {"original": ["212", "718"]}, geometry=[box(0, 0, 10, 10), box(10, 0, 20, 10)], crs=5070
    )
    counties = gpd.GeoDataFrame(
        {"GEOID": ["00001", "00002", "00003", "00004", "00005"]},
        # 00004 is far from every territory; 00005 sits just past 718's edge, like a coastal county.
        geometry=[box(1, 1, 3, 3), box(4, 4, 9, 9), box(12, 2, 14, 4), box(30, 30, 31, 31), box(20.5, 2, 21, 3)],
        crs=5070,
    )
    pops = {"00001": 100, "00002": 250, "00003": 40, "00004": 9999, "00005": 7}
    out, report = population_by_original(originals, counties, pops, nearest_m=2)
    assert out.set_index("code")["population_1950"].to_dict() == {"212": 350, "718": 47}
    assert out.set_index("code")["counties"].to_dict() == {"212": 2, "718": 2}
    assert report["counties_outside"] == ["00004"]
    assert report["counties_without_population"] == []
    assert report["filled_from_state_total"] == []


pytestmark_file = pytest.mark.skipif(not (DATA / "population_1950.csv").exists(), reason="run `make population` first")


@pytestmark_file
def test_population_file_covers_every_original():
    rows = list(csv.DictReader(open(DATA / "population_1950.csv", encoding="utf-8", newline="")))
    assert list(rows[0].keys()) == ["code", "population_1950", "counties", "source"]
    codes = sorted(r["code"] for r in rows)
    originals = sorted(gpd.read_file(DATA / "originals_1947.geojson")["original"].astype(str))
    assert codes == originals
    total = sum(int(r["population_1950"]) for r in rows)
    # The 1950 Census counted 150.7 million in the 48 states; the territories should add up close to it.
    assert 145_000_000 < total < 152_000_000
    by = {r["code"]: int(r["population_1950"]) for r in rows}
    assert by["212"] > 7_000_000  # New York City
    assert by["605"] < 1_000_000  # South Dakota


def test_state_total_fills_a_territory_whose_counties_are_unknown():
    """Connecticut's 2024 county file holds planning regions the 1950 table never had; the
    203 territory takes the 1950 state total instead."""
    from population import state_totals, STATE_FILL

    src = pathlib.Path(__file__).parent / "fixtures" / "cencounts_small.csv"
    src.parent.mkdir(exist_ok=True)
    src.write_text('pop1950,"fips","name"\n2007280,"09000","CT Connecticut"\n18186,"01001","AL Autauga County"\n', encoding="utf-8")
    totals = state_totals(src)
    assert totals["09"] == 2007280
    assert STATE_FILL["203"] == "09"
    originals = gpd.GeoDataFrame({"original": ["203"]}, geometry=[box(0, 0, 10, 10)], crs=5070)
    counties = gpd.GeoDataFrame({"GEOID": ["09110"]}, geometry=[box(1, 1, 2, 2)], crs=5070)
    out, report = population_by_original(originals, counties, {}, totals)
    assert out.set_index("code")["population_1950"].to_dict() == {"203": 2007280}
    assert report["filled_from_state_total"] == ["203"]
