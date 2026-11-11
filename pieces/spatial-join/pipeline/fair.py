"""Fairness check for the grid comparison.

Run from pieces/spatial-join:  python pipeline/fair.py ../../.cache/spatial-join
Writes data/fairness.json.

1. Equal cell size: each grid only comes in fixed steps, so interpolate each grid's
   curve (log-log) to exactly one Manhattan block, 0.02 sq km.
2. Orientation: rotate the city under the fixed grids at six angles and report the spread.
Counts are candidate point-in-zone tests, the same metric as bench.py.
"""
import sys, math, json, time
import numpy as np
import shapely, shapefile, pyproj
from shapely import affinity
from shapely.geometry import shape, Polygon
import h3, a5, s2sphere

DL = sys.argv[1]
LON0, LAT0 = -73.98, 40.70
KX = 111.32 * math.cos(math.radians(LAT0)); KY = 110.574
km = lambda lon, lat: ((np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY)
ll = lambda x, y: (LON0 + np.asarray(x) / KX, LAT0 + np.asarray(y) / KY)

tr = pyproj.Transformer.from_crs(2263, 4326, always_xy=True)
def to_km(g):
    def f(c):
        lon, lat = tr.transform(c[:, 0], c[:, 1]); x, y = km(lon, lat); return np.c_[x, y]
    return shapely.make_valid(shapely.transform(g, f))
rd = shapefile.Reader(f"{DL}/taxi_zones")
zones0 = [to_km(shape(s.__geo_interface__)) for s in rd.shapes()]
zones0 = [z if z.geom_type in ("Polygon", "MultiPolygon") else
          shapely.union_all([p for p in z.geoms if p.geom_type in ("Polygon", "MultiPolygon")]) for z in zones0]
raw = np.loadtxt(f"{DL}/uber-raw-data-sep14.csv", delimiter=",", skiprows=1, usecols=(1, 2))
X0, Y0 = km(raw[:, 1], raw[:, 0]); N = len(X0); M = len(zones0)
bx0, by0, bx1, by1 = shapely.total_bounds(np.array(zones0))
CX, CY = (bx0 + bx1) / 2, (by0 + by1) / 2
mg = 13.0
lo = ll(bx0 - mg, by0 - mg); hi = ll(bx1 + mg, by1 + mg)
ring = [(lo[0], lo[1]), (hi[0], lo[1]), (hi[0], hi[1]), (lo[0], hi[1]), (lo[0], lo[1])]

def cells_geohash(chars):
    nb = chars * 5; dlon = 360 / 2 ** ((nb + 1) // 2); dlat = 180 / 2 ** (nb // 2)
    i = np.arange(int((lo[0] + 180) // dlon), int((hi[0] + 180) // dlon) + 1)
    j = np.arange(int((lo[1] + 90) // dlat), int((hi[1] + 90) // dlat) + 1)
    I, J = [a.ravel() for a in np.meshgrid(i, j)]
    x0, y0 = km(-180 + I * dlon, -90 + J * dlat); x1, y1 = km(-180 + (I + 1) * dlon, -90 + (J + 1) * dlat)
    return shapely.box(x0, y0, x1, y1)
def cells_h3(res):
    poly = h3.LatLngPoly([(la, lo_) for lo_, la in ring[:-1]]); out = []
    for c in h3.polygon_to_cells(poly, res):
        b = h3.cell_to_boundary(c); x, y = km([v[1] for v in b], [v[0] for v in b]); out.append(Polygon(np.c_[x, y]))
    return np.array(out)
def cells_a5(res):
    ids = [c for c in a5.uncompact(a5.polygon_to_cells(ring, res, {"containment": "overlapping"})) if not a5.is_compaction_marker(c)]
    out = []
    for c in ids:
        b = a5.cell_to_boundary(c); x, y = km([v[0] for v in b], [v[1] for v in b]); out.append(Polygon(np.c_[x, y]))
    return np.array(out)
def cells_s2(level):
    rc = s2sphere.RegionCoverer(); rc.min_level = rc.max_level = level; rc.max_cells = 10 ** 7
    rect = s2sphere.LatLngRect.from_point_pair(s2sphere.LatLng.from_degrees(lo[1], lo[0]), s2sphere.LatLng.from_degrees(hi[1], hi[0]))
    out = []
    for cid in rc.get_covering(rect):
        cell = s2sphere.Cell(cid); v = [s2sphere.LatLng.from_point(cell.get_vertex(k)) for k in range(4)]
        x, y = km([q.lng().degrees for q in v], [q.lat().degrees for q in v]); out.append(Polygon(np.c_[x, y]))
    return np.array(out)

GR = {"geohash": (cells_geohash, [6, 7]), "s2": (cells_s2, [15, 16]), "h3": (cells_h3, [9, 10]), "a5": (cells_a5, [15, 16])}
CELLS = {}; TREES = {}; AREA = {}; SHAPE = {}
for name, (fn, levels) in GR.items():
    for lv in levels:
        t = time.time(); c = fn(lv); CELLS[name, lv] = c; TREES[name, lv] = shapely.STRtree(c)
        near = c[shapely.intersects(c, shapely.box(bx0, by0, bx1, by1))]
        AREA[name, lv] = float(shapely.area(near).mean())
        SHAPE[name, lv] = float((shapely.length(near) / np.sqrt(shapely.area(near))).mean())
        print(name, lv, len(c), "cells", round(AREA[name, lv], 4), "sq km, edge/sqrt(area)", round(SHAPE[name, lv], 3), round(time.time() - t, 1), "s", flush=True)

TARGET = 0.02
out = {"target": TARGET, "angles": [], "nested": N * M, "shape": {k[0]: SHAPE[k] for k in SHAPE if k[1] == GR[k[0]][1][1]},
       "rtree": [], "grids": {g: {"tests": [], "settled": [], "raw": []} for g in GR}}
for ang in [0, 15, 30, 45, 60, 75]:
    t = time.time()
    zones = np.array([affinity.rotate(z, ang, origin=(CX, CY)) for z in zones0])
    a = math.radians(ang); dx, dy = X0 - CX, Y0 - CY
    X = CX + dx * math.cos(a) - dy * math.sin(a); Y = CY + dx * math.sin(a) + dy * math.cos(a)
    P = shapely.points(X, Y)
    ztree = shapely.STRtree(zones)
    out["angles"].append(ang); out["rtree"].append(int(len(ztree.query(P)[0])))
    for name, (fn, levels) in GR.items():
        pts = []
        for lv in levels:
            carr = CELLS[name, lv]
            ci, zj = ztree.query(carr, predicate="intersects")
            keep = shapely.area(shapely.intersection(carr[ci], zones[zj])) > 1e-12
            ci, zj = ci[keep], zj[keep]
            ncand = np.bincount(ci, minlength=len(carr))
            o = np.argsort(ci, kind="stable"); first = np.full(len(carr), -1); first[ci[o][::-1]] = zj[o][::-1]
            inside = np.zeros(len(carr), bool); m = ncand == 1
            inside[m] = shapely.contains_properly(zones[first[m]], carr[m])
            qi, qc = TREES[name, lv].query(P, predicate="intersects")
            cell_of = np.full(N, -1, np.int64); cell_of[qi[::-1]] = qc[::-1]
            ok = cell_of >= 0
            settled = float(inside[cell_of[ok]].sum() / N)
            tests = int(ncand[cell_of[ok]][~inside[cell_of[ok]]].sum())
            pts.append((AREA[name, lv], tests, settled))
        (a1, t1, s1), (a2, t2, s2) = pts
        w = (math.log(TARGET) - math.log(a1)) / (math.log(a2) - math.log(a1))
        out["grids"][name]["tests"].append(float(math.exp(math.log(t1) + w * (math.log(t2) - math.log(t1)))))
        out["grids"][name]["settled"].append(float(s1 + w * (s2 - s1)))
        out["grids"][name]["raw"].append(pts)
    print("angle", ang, "rtree", out["rtree"][-1], {g: (round(out["grids"][g]["tests"][-1] / 1e6, 3), round(out["grids"][g]["settled"][-1], 3)) for g in GR},
          round(time.time() - t, 1), "s", flush=True)
json.dump(out, open("data/fairness.json", "w"), indent=1)
print("saved")
