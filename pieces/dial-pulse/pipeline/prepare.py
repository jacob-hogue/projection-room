"""Turn the 2015 area code polygons into the small TopoJSON the page draws.

Steps: repair geometry, normalize columns, drop overlay features (they duplicate their
parent's geometry; overlays are rebuilt from lineage.csv), keep the lower 48, clip to the
state outline minus the Great Lakes, project to Conus Albers (EPSG:5070), clean and
simplify the polygons as one coverage so shared edges match exactly, then write
data/areas.topojson (via topo.mjs) with one feature per territory carrying `npa` and `id`.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys
import zipfile

import geopandas as gpd
import shapely
from shapely import make_valid, unary_union
from shapely.geometry import box

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE.parent.parent.parent / ".cache"
DATA = HERE.parent / "data"
ALBERS = 5070
LOWER48_BBOX = box(-125.5, 24.0, -66.5, 49.8)
NOT_LOWER48_STATES = {"AK", "HI", "PR", "VI", "GU", "MP", "AS"}
NOT_LOWER48_CODES = {"907", "808", "787", "939", "340", "671", "670", "684"}
GREAT_LAKES = {"Lake Superior", "Lake Michigan", "Lake Huron", "Lake Erie", "Lake Ontario"}
SIMPLIFY_M = 1500
GAP_M = 3000  # slivers between neighbours narrower than this are merged away
QUANTIZATION = 1e5


def normalize(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Lower-case the code column to `npa` as a string; leave other columns alone."""
    out = gdf.copy()
    if "npa" not in out.columns:
        code_col = next(c for c in out.columns if c != out.geometry.name
                        and out[c].astype(str).str.fullmatch(r"\d{3}").mean() > 0.9)
        out = out.rename(columns={code_col: "npa"})
    out["npa"] = out["npa"].astype(str).str.zfill(3)
    return out


def drop_overlays(gdf: gpd.GeoDataFrame, lineage_types: dict[str, str] | None = None) -> gpd.GeoDataFrame:
    """Keep territories, drop overlays. The lineage table decides (type == "overlay");
    the file's TYPE flag is used only for codes the table does not know. The 2015 file
    flags 706 as an overlay although it is a 1992 split with its own territory."""
    out = normalize(gdf)
    types = lineage_types or {}
    def is_overlay(row) -> bool:
        if row["npa"] in types:
            return types[row["npa"]] == "overlay"
        return "TYPE" in out.columns and (row.get("TYPE") or "") == "O"
    keep = ~out.apply(is_overlay, axis=1)
    return out[keep.values]


def lineage_types(path: pathlib.Path) -> dict[str, str]:
    import csv
    with open(path, encoding="utf-8", newline="") as f:
        return {r["code"]: r["type"] for r in csv.DictReader(f)}


def repair(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Make every geometry valid and keep only its polygonal parts. The 2015 file stores
    some holes as keyholes (one ring bridged to the hole along a zero-width cut); make_valid
    turns those into interior rings and leaves the cut behind as a line, which is dropped."""
    def polygonal(geom):
        fixed = make_valid(geom)
        parts = [p for p in getattr(fixed, "geoms", [fixed]) if p.geom_type in ("Polygon", "MultiPolygon")]
        if not parts:
            return None
        return parts[0] if len(parts) == 1 else unary_union(parts)
    out = gdf.copy()
    out["geometry"] = out.geometry.apply(polygonal)
    return out[out.geometry.notna() & ~out.geometry.is_empty].reset_index(drop=True)


def lower48(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = normalize(gdf)
    if "COUNTRY" in out.columns:
        out = out[out["COUNTRY"].fillna("UNITED STATES").str.upper() == "UNITED STATES"]
    if "STATE" in out.columns:
        out = out[~out["STATE"].fillna("").isin(NOT_LOWER48_STATES)]
    out = out[~out["npa"].isin(NOT_LOWER48_CODES)]
    centroids = out.geometry.to_crs(4326).representative_point() if out.crs else out.geometry.representative_point()
    inside = centroids.within(LOWER48_BBOX)
    return out[inside.values].reset_index(drop=True)


def to_albers(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = normalize(gdf)
    if out.crs is None:
        out = out.set_crs(4326)
    return out.to_crs(ALBERS)


def simplify(gdf: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    out = normalize(gdf).copy()
    out["geometry"] = out.geometry.simplify(tolerance_m, preserve_topology=True).apply(make_valid)
    return out


def clean_coverage(gdf: gpd.GeoDataFrame, gap_m: float, snap_m: float | None = None) -> gpd.GeoDataFrame:
    """Make the polygons a clean coverage: no overlaps, gaps narrower than `gap_m` merged
    into the neighbour with the longest shared border, and every shared edge identical on
    both sides. Without this, neighbours whose edges differ by a few hundred metres each
    get their own arc, and merging them in the browser leaves open rings that draw as spikes.
    Overlaps go to the smaller polygon: some parents in the 2015 file still cover their
    later splits, and the split is the one that must keep its territory."""
    out = normalize(gdf).copy()
    kwargs = {"gap_width": gap_m, "merge_strategy": "min_area"}
    if snap_m is not None:
        kwargs["snapping_distance"] = snap_m
    out["geometry"] = shapely.coverage_clean(out.geometry.values, **kwargs)
    return out[~out.geometry.is_empty].reset_index(drop=True)


def orient(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Wind every exterior ring counterclockwise and every hole clockwise. topojson.merge
    can only stitch a group's outer boundary when neighbours wind the same way."""
    out = normalize(gdf).copy()
    out["geometry"] = shapely.orient_polygons(out.geometry.values, exterior_cw=False)
    return out


def simplify_coverage(gdf: gpd.GeoDataFrame, tolerance_m: float) -> gpd.GeoDataFrame:
    """Simplify shared edges once for both neighbours, so the coverage stays clean."""
    out = normalize(gdf).copy()
    out["geometry"] = shapely.coverage_simplify(out.geometry.values, tolerance_m, simplify_boundary=True)
    return out


def write_topojson(gdf: gpd.GeoDataFrame, path: pathlib.Path, quantization: float,
                   toposimplify_m: float | None = None) -> None:
    """Write `gdf` (already projected) as TopoJSON through topo.mjs, the reference
    topojson-server tool. Shared edges become shared arcs. The pipeline simplifies the
    coverage before this step, so `toposimplify_m` is normally left at None."""
    out = orient(gdf)
    out = out[["npa", "geometry"]].reset_index(drop=True)
    out["id"] = range(len(out))
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    geojson = path.with_suffix(".geojson.tmp")
    out.to_file(geojson, driver="GeoJSON")
    try:
        subprocess.run(
            ["node", str(HERE / "topo.mjs"), str(geojson), str(path), str(quantization), str(toposimplify_m or 0)],
            check=True, shell=False,
        )
    finally:
        geojson.unlink(missing_ok=True)


def lower48_outline() -> gpd.GeoDataFrame:
    """Lower-48 states dissolved, minus the Great Lakes, in EPSG:4326. Cached as a GeoPackage."""
    cached = CACHE / "lower48_outline.gpkg"
    if cached.exists():
        return gpd.read_file(cached)
    def shp(zip_name: str) -> str:
        inner = [n for n in zipfile.ZipFile(CACHE / zip_name).namelist() if n.endswith(".shp")][0]
        return f"/vsizip/{(CACHE / zip_name).as_posix()}/{inner}"
    states = gpd.read_file(shp("ne_states.zip"), columns=["iso_a2", "iso_3166_2", "name"])
    states = states[(states["iso_a2"] == "US") & ~states["iso_3166_2"].isin({"US-AK", "US-HI"})]
    lakes = gpd.read_file(shp("ne_lakes.zip"), columns=["name"])
    lakes = lakes[lakes["name"].isin(GREAT_LAKES)]
    land = make_valid(states.geometry.union_all())
    water = make_valid(lakes.geometry.union_all())
    outline = gpd.GeoDataFrame({"name": ["lower48"]}, geometry=[land.difference(water)], crs=4326)
    outline.to_file(cached, driver="GPKG")
    return outline


def main() -> int:
    areas = repair(gpd.read_file(CACHE / "area-codes.geojson"))
    areas = lower48(drop_overlays(areas, lineage_types(HERE / "lineage.csv")))
    outline = lower48_outline()
    clipped = gpd.clip(areas, outline).explode(index_parts=False)
    clipped = clipped.dissolve(by="npa", as_index=False)[["npa", "geometry"]]
    albers = simplify_coverage(clean_coverage(to_albers(clipped), gap_m=GAP_M), SIMPLIFY_M)
    if not shapely.coverage_is_valid(albers.geometry.values):
        print("territories do not form a clean coverage after cleaning", file=sys.stderr)
        return 1
    out_path = DATA / "areas.topojson"
    write_topojson(albers, out_path, QUANTIZATION)
    size = out_path.stat().st_size
    print(f"{len(albers)} territories -> {out_path} ({size:,} bytes)")
    if size > 1_500_000:
        print("areas.topojson is over the 1.5 MB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
