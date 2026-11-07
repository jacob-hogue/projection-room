import json
import pathlib

import geopandas as gpd
import pytest

from prepare import lower48, simplify, to_albers, write_topojson

FIXTURE = pathlib.Path(__file__).resolve().parent / "fixtures" / "three_areas.geojson"


@pytest.fixture(scope="module")
def areas():
    return gpd.read_file(FIXTURE)


def test_lower48_drops_alaska(areas):
    assert set(lower48(areas)["npa"]) == {"212", "718"}


def test_albers_crs(areas):
    assert to_albers(areas).crs.to_epsg() == 5070


def test_simplify_keeps_every_feature(areas):
    out = simplify(to_albers(areas), 500)
    assert len(out) == 3
    assert out.geometry.is_valid.all()


def test_topojson_has_npa_property(areas, tmp_path):
    write_topojson(to_albers(areas), tmp_path / "t.json", 10_000)
    topo = json.load(open(tmp_path / "t.json", encoding="utf-8"))
    props = sorted(g["properties"]["npa"] for g in topo["objects"]["areas"]["geometries"])
    assert props == ["212", "718", "907"]


def test_drop_overlays_dedupes_by_geometry_not_type_flag():
    """The 2015 file's TYPE flag is unreliable (706 is flagged "O" but has its own
    territory, and six true overlays have slightly different polygons from their parents),
    so the lineage table decides: drop codes it marks as overlays, keep the rest."""
    from shapely.geometry import box
    from prepare import drop_overlays

    square = box(0, 0, 1, 1)
    other = box(2, 0, 3, 1)
    gdf = gpd.GeoDataFrame(
        {"NPA": ["917", "212", "706"], "TYPE": ["O", None, "O"]},
        geometry=[square, square, other], crs=4326,
    )
    types = {"212": "original", "917": "overlay", "706": "split"}
    out = drop_overlays(gdf, types)
    assert sorted(out["npa"]) == ["212", "706"]
