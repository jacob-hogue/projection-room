import csv
import json
import pathlib

import geopandas as gpd
import pytest

PIPE = pathlib.Path(__file__).resolve().parents[1]
DATA = PIPE.parent / "data"
CACHE = PIPE.parent.parent.parent / ".cache"

pytestmark = pytest.mark.skipif(
    not (DATA / "originals_1947.geojson").exists(), reason="run `make compute` first"
)


def test_77_us_originals():
    g = gpd.read_file(DATA / "originals_1947.geojson")
    assert len(g) == 77
    assert g["original"].astype(str).str.fullmatch(r"\d{3}").all()


def test_originals_cover_lower48():
    g = gpd.read_file(DATA / "originals_1947.geojson").set_crs(5070, allow_override=True)
    outline = gpd.read_file(CACHE / "lower48_outline.gpkg").to_crs(5070)
    assert g.geometry.union_all().area / outline.geometry.union_all().area > 0.995


def test_originals_csv_lists_every_us_original():
    rows = list(csv.DictReader(open(PIPE / "originals_1947.csv", encoding="utf-8", newline="")))
    assert list(rows[0].keys()) == ["code", "territory", "county_geoids"]
    g = gpd.read_file(DATA / "originals_1947.geojson")
    assert sorted(r["code"] for r in rows) == sorted(g["original"].astype(str))


def test_report_lists_fallbacks():
    r = json.load(open(DATA / "originals_1947_report.json", encoding="utf-8"))
    assert set(r) == {"from_dissolve", "from_counties"}
    assert len(r["from_dissolve"]) + len(r["from_counties"]) == 77
