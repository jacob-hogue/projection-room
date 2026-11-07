"""Walk the lineage table to say which codes a territory carried in any year, 1947 to today.

Rules (shared with src/lib/lineage.ts):
- A territory is a 2015 polygon identified by its 2015 code.
- Its code in effect in year Y is the nearest ancestor (itself included) whose year <= Y.
- Overlays in effect are overlay-type codes whose parent chain reaches that code in effect
  and whose year <= Y.
- The original of a code is the end of its parent chain, always a 1947 code.

Outputs: data/lineage.json for the browser, data/originals_1947.geojson (the 1947 map
rebuilt by dissolving 2015 territories by original), and a loud KeyError when a 2015 code
is missing from the table.
"""
from __future__ import annotations

import csv
import json
import pathlib
import sys
from dataclasses import dataclass

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data"


@dataclass(frozen=True)
class Row:
    code: str
    parent: str | None
    year: int
    type: str


Lineage = dict[str, Row]


def load_lineage(path: pathlib.Path) -> Lineage:
    out: Lineage = {}
    with open(path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            out[r["code"]] = Row(r["code"], r["parent"] or None, int(r["year"]), r["type"])
    return out


def _row(code: str, lineage: Lineage) -> Row:
    try:
        return lineage[code]
    except KeyError:
        raise KeyError(f"area code {code} is not in the lineage table") from None


def original_of(code: str, lineage: Lineage) -> str:
    row = _row(code, lineage)
    while row.parent:
        row = _row(row.parent, lineage)
    return row.code


def codes_in_effect(year: int, lineage: Lineage) -> set[str]:
    return {c for c, r in lineage.items() if r.year <= year}


def code_in_effect_for(territory: str, year: int, lineage: Lineage) -> str:
    """The non-overlay code a 2015 territory carried in `year`: walk up until year <= Y."""
    row = _row(territory, lineage)
    while row.year > year or row.type == "overlay":
        if not row.parent:
            raise ValueError(f"{territory} has no code in effect in {year}")
        row = _row(row.parent, lineage)
    return row.code


def _overlay_children(lineage: Lineage) -> dict[str, list[Row]]:
    kids: dict[str, list[Row]] = {}
    for r in lineage.values():
        if r.type == "overlay" and r.parent:
            kids.setdefault(r.parent, []).append(r)
    return kids


def polygon_codes(territory: str, year: int, lineage: Lineage) -> list[str]:
    """All codes a territory carries in `year`: its code in effect first, then overlays,
    ordered by year then numerically."""
    base = code_in_effect_for(territory, year, lineage)
    kids = _overlay_children(lineage)
    found: list[Row] = [_row(base, lineage)]
    stack = [base]
    seen = {base}
    while stack:
        parent = stack.pop()
        for k in kids.get(parent, []):
            if k.year <= year and k.code not in seen:
                found.append(k)
                seen.add(k.code)
                stack.append(k.code)
    found.sort(key=lambda r: (r.year, int(r.code)))
    return [r.code for r in found]


def export_lineage_json(lineage: Lineage, path: pathlib.Path) -> None:
    payload = {"codes": {c: {"parent": r.parent, "year": r.year, "type": r.type}
                         for c, r in sorted(lineage.items())}}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")


def build_originals(areas, lineage: Lineage):
    """Dissolve 2015 territories by their 1947 original. Repairs geometry first, because
    simplified polygons can self-intersect and GEOS refuses to union those."""
    from shapely import make_valid

    out = areas.copy()
    out["npa"] = out["npa"].astype(str)
    missing = sorted(c for c in out["npa"] if c not in lineage)
    if missing:
        raise KeyError(f"2015 codes missing from lineage.csv: {', '.join(missing)}")
    out["geometry"] = out.geometry.apply(make_valid)
    out["original"] = out["npa"].map(lambda c: original_of(c, lineage))
    dissolved = out.dissolve(by="original", as_index=False)[["original", "geometry"]]
    dissolved["geometry"] = dissolved.geometry.apply(make_valid)
    return dissolved


def main() -> int:
    import geopandas as gpd

    lineage = load_lineage(HERE / "lineage.csv")
    areas = gpd.read_file(DATA / "areas.topojson")
    if areas.crs is None:
        areas = areas.set_crs(5070)
    export_lineage_json(lineage, DATA / "lineage.json")
    originals = build_originals(areas, lineage)
    originals.to_file(DATA / "originals_1947.geojson", driver="GeoJSON")
    print(f"lineage.json: {len(lineage)} codes; originals_1947.geojson: {len(originals)} areas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
