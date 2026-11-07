import pathlib

import pytest

from compute import codes_in_effect, load_lineage, original_of, polygon_codes

FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "lineage_small.csv"


@pytest.fixture(scope="module")
def L():
    return load_lineage(FIXTURE)


def test_original_of(L):
    assert original_of("347", L) == "212"
    assert original_of("212", L) == "212"


def test_codes_in_effect_1947(L):
    assert codes_in_effect(1947, L) == {"212"}


def test_codes_in_effect_2000(L):
    assert codes_in_effect(2000, L) == {"212", "718", "917", "347"}


def test_polygon_codes_before_split(L):
    assert polygon_codes("718", 1980, L) == ["212"]


def test_polygon_codes_with_overlays(L):
    assert polygon_codes("718", 2000, L) == ["718", "347"]
    assert polygon_codes("212", 2000, L) == ["212", "917"]


def test_missing_code_raises(L):
    with pytest.raises(KeyError, match="999"):
        polygon_codes("999", 2000, L)


def test_build_originals_repairs_invalid_geometry(L):
    import geopandas as gpd
    from shapely.geometry import Polygon
    from compute import build_originals

    bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])  # self-intersecting
    square = Polygon([(20, 0), (30, 0), (30, 10), (20, 10), (20, 0)])
    areas = gpd.GeoDataFrame({"npa": ["718", "917"]}, geometry=[bowtie, square], crs=5070)
    out = build_originals(areas, L)
    assert list(out["original"]) == ["212"]
    assert out.geometry.is_valid.all()
    from shapely import make_valid
    # make_valid keeps both lobes of the bow-tie (buffer(0) would drop one)
    assert out.geometry.iloc[0].area == pytest.approx(make_valid(bowtie).area + square.area)
