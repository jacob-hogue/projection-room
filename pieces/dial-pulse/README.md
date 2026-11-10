# The dial-pulse map

Area codes of the lower 48 states, colored by how many clicks it took to dial them on a rotary phone, from the 1947 plan to 2025. Page: [jacob-hogue.github.io/projection-room/dial-pulse](https://jacob-hogue.github.io/projection-room/dial-pulse/).

## Rebuild the data

```sh
cd pipeline
pip install -r requirements.txt     # Python 3.11; Shapely 2.2 on GEOS 3.14
make all                            # download, prepare, compute, population, check
make test                           # pytest
```

Downloads are cached in the repository's `.cache/` folder and never committed. `make all` writes:

- `data/areas.topojson`: the 2015 territories, cleaned as one coverage and simplified at 1.5 km, in EPSG:5070.
- `data/lineage.json`: code, parent, year and type for 425 codes, from `pipeline/lineage.csv`.
- `data/originals_1947.geojson`: the 77 United States originals, dissolved from their descendants.
- `data/population_1950.csv`: 1950 population per 1947 territory, from the Census county table.
- `data/nanpa_counts.csv` is the reference the check step compares against.

`make poster` renders `public/dial-pulse/poster.{svg,png}` from the built site. The film is a Remotion project in `film/`: `npm install`, then `npm run render` and `npm run render:loop`.

## Data recipe

1. Polygons: `1ec5/nanp-boundaries` (UCLA Geoportal, October 14, 2015). Overlay features are dropped by the lineage table's type, not the file's flag (the file marks 706 as an overlay; it is a 1992 split).
2. Clean: `make_valid`, keep polygonal parts, clip to the Natural Earth lower-48 outline minus the Great Lakes, project to EPSG:5070, then `shapely.coverage_clean` (gap width 3 km, overlaps to the smaller polygon) and `coverage_simplify` at 1,500 m, exterior rings counterclockwise, written as TopoJSON by `scripts/topo.mjs`.
3. Lineage: drafted from NANPA's in-service dates and Wikipedia's originals table, hand-checked for 47 low-confidence rows against the per-code articles. Every non-original code has a parent.
4. Population: 2024 cartographic counties assigned to the 1947 territory containing their representative point (nearest within 50 km for coastal counties), summed from the Forstall 1900 to 1990 county table (NBER CSV). Codes recoded for counties that no longer exist; Connecticut filled from the state total.
5. Check: codes in service per year against NANPA for 12 years (all exact); 77 originals; every ring closes in the browser.

## Known gaps

- Geometry frozen at 2015; 607, 608 and 806 assigned wholly to their main parent.
- Slivers under 3 km between neighbours merged away.
- Connecticut 1950 population from the state total; counties created after 1950 counted in their parent county.
- Canada in the lineage table, not on the map.
- The pulse explanation for the 1947 assignments is the usual account and is disputed; the page shows the pattern and says so.
