# The spatial join

A million Uber pickups matched to New York's 263 taxi zones six ways: brute force, an R-tree, and four grid indexes (Geohash, S2, H3, A5). Page: [jacob-hogue.github.io/projection-room/spatial-join](https://jacob-hogue.github.io/projection-room/spatial-join/).

## Rebuild the numbers

```sh
cd pieces/spatial-join
pip install -r pipeline/requirements.txt              # Python 3.13; Shapely 2.2 on GEOS 3.14
python pipeline/download.py ../../.cache/spatial-join # the two public inputs, about 50 MB, never committed
python pipeline/bench.py ../../.cache/spatial-join    # about 2 minutes; writes data/results.json and data.pkl
python pipeline/fair.py ../../.cache/spatial-join     # about 4 minutes; writes data/fairness.json
```

- `data/results.json`: tests run, share of pickups settled by cell ID, join time and cell count for every method and grid level.
- `data/fairness.json`: tests at exactly 0.02 sq km for each grid, at six rotations of the city, plus the R-tree's count at each rotation.
- `data.pkl` is the working file the film reads. It is not committed.

## Rebuild the film

```sh
python film/render.py stills                 # a few full-size frames to check
python film/render.py video                  # one s<N>.mp4 per scene
python film/render.py srt film/captions.srt  # the caption file
python film/poster.py ../../public/spatial-join
```

Join the scene files with FFmpeg's concat demuxer and `-c copy`, and save the result as `public/spatial-join/film.mp4`.

## Method

1. Points: Uber pickups for September 2014 from FiveThirtyEight's `uber-tlc-foil-response` (1,028,136 rows). Polygons: the NYC TLC taxi zones shapefile (263 zones, 98,192 vertices, EPSG:2263), from the copy in `toddwschneider/nyc-taxi-data`.
2. Both are converted to kilometers on a flat local grid centered at 40.70 N, 73.98 W. Zones are passed through `make_valid`.
3. Every method uses the same exact test, `shapely.contains_xy` on prepared zones, on one core. A pickup in more than one zone gets the lowest zone index, in every method.
4. Brute force tests every pickup against every zone. The R-tree is Shapely's `STRtree`: bounding-box candidates, then the exact test.
5. Grids: cells come from h3-py, pya5 and s2sphere; Geohash rectangles are computed directly. A cell is "interior" when it touches exactly one zone and that zone properly contains it. Pickups in interior cells take the cell's zone. All other pickups get the exact test against each zone that overlaps their cell.
6. Every method must return the same zone as brute force for every pickup. The run asserts this for the R-tree and reports zero mismatches for all 17 grid levels.
7. Timings are the median of nine runs (brute force once). Grid timings start from a stored cell ID per pickup.
8. Fairness: each grid's test count is interpolated (log-log) between its two nearest levels to exactly 0.02 sq km. The zones and pickups are then rotated about the city's center by 0, 15, 30, 45, 60 and 75 degrees under the fixed grids, and the counts are recomputed.

## Known gaps

- Pickups are assigned to cells by testing against each library's cell outlines in the flat local grid, not by calling each library's own lookup.
- The cost of computing a pickup's cell ID is not in the grid timings.
- One city and one month. Larger zones or evenly spread points would move the point where grids overtake the R-tree.
- Uber's coordinates are rounded to four decimal places, about 10 m.
