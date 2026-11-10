import json

import geopandas as gpd
from shapely.geometry import box

from prepare import RUN_DATE, clamp_date, edit_year, freshness, town_rows, write_topojson


def test_edit_year_handles_missing_and_future_dates():
    assert edit_year(20250709) == 2025
    assert edit_year(0) is None
    assert edit_year(None) is None
    assert clamp_date(20360101) == RUN_DATE
    assert clamp_date(20250709) == 20250709


def test_freshness_is_share_of_2023_or_later():
    bands = {"before2015": 50, "2015to2019": 20, "2020to2022": 10, "2023to2024": 15, "2025on": 5}
    assert freshness(bands) == 0.2
    assert freshness({}) is None


def test_town_rows_keep_towns_the_service_omits():
    towns = gpd.GeoDataFrame(
        {"TOWN_ID": [1, 2], "TOWN": ["A", "B"]}, geometry=[box(0, 0, 1, 1), box(1, 0, 2, 1)], crs=26986
    )
    stats = {1: {"n": 10, "last_edit": 20260101}}
    bands = {"2025on": {1: 5}}
    rows = town_rows(towns, stats, bands)
    assert rows.loc[rows.id == 2, "n"].item() == 0
    assert rows.loc[rows.id == 2, "fresh"].isna().item()
    assert rows.loc[rows.id == 1, "fresh"].item() == 0.5


def test_topojson_carries_properties(tmp_path):
    g = gpd.GeoDataFrame({"id": [1], "name": ["A"]}, geometry=[box(0, 0, 100, 100)], crs=26986)
    write_topojson(g, tmp_path / "t.json", "towns", 1e4, 0)
    topo = json.load(open(tmp_path / "t.json", encoding="utf-8"))
    assert topo["objects"]["towns"]["geometries"][0]["properties"] == {"id": 1, "name": "A"}
