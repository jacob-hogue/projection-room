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


def test_repair_opens_keyholes_into_holes():
    """The 2015 file stores some holes as keyholes: one ring that runs out to the hole along
    a zero-width cut and back. Simplified, the cut becomes a visible spike. repair() turns
    them into proper interior rings and keeps only polygonal parts."""
    from shapely.geometry import Polygon
    from prepare import repair

    keyhole = Polygon([(0, 0), (10, 0), (10, 10), (0, 10), (0, 5),
                       (4, 5), (4, 4), (6, 4), (6, 6), (4, 6), (4, 5), (0, 5)])
    gdf = gpd.GeoDataFrame({"NPA": ["602"]}, geometry=[keyhole], crs=4326)
    out = repair(gdf)
    assert len(out) == 1
    geom = out.geometry.iloc[0]
    assert geom.is_valid
    assert geom.geom_type == "Polygon"
    assert len(geom.interiors) == 1
    assert geom.area == pytest.approx(100 - 4)


def _offset_neighbours():
    """Two squares that should share the edge x=10 but do not: the right square's edge
    wanders, leaving a sliver of overlap and a sliver of gap, like the 2015 source."""
    from shapely.geometry import Polygon
    left = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    right = Polygon([(10.3, 0), (20, 0), (20, 10), (9.7, 10), (10.3, 5)])
    return gpd.GeoDataFrame({"npa": ["212", "718"]}, geometry=[left, right], crs=5070)


def test_clean_coverage_makes_shared_edges_coincide():
    import shapely
    from prepare import clean_coverage

    gdf = _offset_neighbours()
    assert not shapely.coverage_is_valid(gdf.geometry.values)
    out = clean_coverage(gdf, gap_m=1.0)
    assert list(out["npa"]) == ["212", "718"]
    assert shapely.coverage_is_valid(out.geometry.values)
    assert out.geometry.area.sum() == pytest.approx(gdf.geometry.union_all().area, rel=0.01)


def test_simplify_coverage_keeps_a_valid_coverage():
    import shapely
    from shapely.geometry import Polygon
    from prepare import clean_coverage, simplify_coverage

    # A wiggly shared edge with 200 vertices; simplification must keep both sides identical.
    ys = [i / 20 for i in range(201)]
    edge = [(10 + (0.05 if i % 2 else -0.05), y) for i, y in enumerate(ys)]
    left = Polygon([(0, 0), *edge, (0, 10)])
    right = Polygon([(20, 0), (20, 10), *reversed(edge)])
    gdf = clean_coverage(gpd.GeoDataFrame({"npa": ["212", "718"]}, geometry=[left, right], crs=5070), gap_m=0.0)
    out = simplify_coverage(gdf, tolerance_m=0.5)
    assert shapely.coverage_is_valid(out.geometry.values)
    assert int(shapely.get_num_coordinates(out.geometry.values).sum()) < 40
    assert out.geometry.area.sum() == pytest.approx(gdf.geometry.area.sum(), rel=0.01)


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


def test_clean_coverage_keeps_a_split_carved_from_its_parent():
    """In the 2015 file some parents still cover their later splits. The overlap must go
    to the smaller polygon (the split), not be merged into the parent."""
    import shapely
    from shapely.geometry import box
    from prepare import clean_coverage

    gdf = gpd.GeoDataFrame({"npa": ["219", "260"]}, geometry=[box(0, 0, 10, 10), box(2, 2, 4, 4)], crs=5070)
    out = clean_coverage(gdf, gap_m=0.0)
    assert list(out["npa"]) == ["219", "260"]
    assert shapely.coverage_is_valid(out.geometry.values)
    assert out.set_index("npa").geometry.area.to_dict() == pytest.approx({"219": 96.0, "260": 4.0})


def test_orient_makes_every_exterior_ring_counterclockwise():
    """topojson.merge can only stitch a group's outer boundary when all polygons wind the
    same way; the 2015 file mixes both directions."""
    import shapely
    from shapely.geometry import Polygon
    from prepare import orient

    cw = Polygon([(0, 0), (0, 10), (10, 10), (10, 0)])
    ccw = Polygon([(10, 0), (20, 0), (20, 10), (10, 10)], holes=[[(12, 2), (14, 2), (14, 4), (12, 4)]])
    assert not cw.exterior.is_ccw and ccw.exterior.is_ccw
    out = orient(gpd.GeoDataFrame({"npa": ["212", "718"]}, geometry=[cw, ccw], crs=5070))
    for geom in out.geometry:
        for part in getattr(geom, "geoms", [geom]):
            assert part.exterior.is_ccw
            assert all(not ring.is_ccw for ring in part.interiors)
    assert out.geometry.area.tolist() == pytest.approx([100.0, 96.0])


def test_state_lines_are_interior_borders_in_albers(tmp_path):
    """State lines for the atlas look: the lower-48 state borders, projected like the
    territories, written as a TopoJSON with one object `states`."""
    import json
    from shapely.geometry import box
    from prepare import write_states

    states = gpd.GeoDataFrame(
        {"iso_3166_2": ["US-AA", "US-BB", "US-AK"]},
        geometry=[box(-100, 40, -95, 45), box(-95, 40, -90, 45), box(-150, 60, -140, 70)],
        crs=4326,
    )
    out = tmp_path / "states.topojson"
    write_states(states, out, quantization=1e4)
    topo = json.loads(out.read_text(encoding="utf-8"))
    assert "states" in topo["objects"]
    codes = sorted(g["properties"]["state"] for g in topo["objects"]["states"]["geometries"])
    assert codes == ["AA", "BB"]  # Alaska is not on the map
