"""Real-data spatial join benchmark.

Run from pieces/spatial-join:  python pipeline/bench.py ../../.cache/spatial-join
Writes data.pkl (working file for the film, not committed) and data/results.json.

Points: Uber pickups, NYC, September 2014 (FiveThirtyEight FOIL release).
Polygons: NYC TLC taxi zones (official shapefile, 263 zones).
Every method gets the same points and zones, uses the same exact test
(shapely.contains_xy on prepared zones), and must return the same answer.
"""
import sys, math, time, pickle
import numpy as np
import shapely, shapefile, pyproj
from shapely.geometry import shape, Polygon
import h3, a5, s2sphere

DL = sys.argv[1]
LON0, LAT0 = -73.98, 40.70
KX = 111.32 * math.cos(math.radians(LAT0)); KY = 110.574

def km(lon, lat):
    return (np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY

def ll(x, y):
    return LON0 + np.asarray(x) / KX, LAT0 + np.asarray(y) / KY

# ---------------------------------------------------------------- load
tr = pyproj.Transformer.from_crs(2263, 4326, always_xy=True)
def to_km(g):
    def f(c):
        lon, lat = tr.transform(c[:, 0], c[:, 1]); x, y = km(lon, lat); return np.c_[x, y]
    return shapely.make_valid(shapely.transform(g, f))
rd = shapefile.Reader(f"{DL}/taxi_zones")
zones = np.array([to_km(shape(s.__geo_interface__)) for s in rd.shapes()])
zones = np.array([z if z.geom_type in ("Polygon", "MultiPolygon") else
                  shapely.union_all([p for p in z.geoms if p.geom_type in ("Polygon", "MultiPolygon")]) for z in zones])
names = [r["zone"] for r in rd.records()]
M = len(zones)
shapely.prepare(zones)
raw = np.loadtxt(f"{DL}/uber-raw-data-sep14.csv", delimiter=",", skiprows=1, usecols=(1, 2))
X, Y = km(raw[:, 1], raw[:, 0]); N = len(X)
print("zones", M, "points", N, "vertices", int(shapely.get_num_coordinates(zones).sum()), flush=True)

def assign(n, pi, zi, hit):
    out = np.full(n, M, np.int32)
    np.minimum.at(out, pi[hit], zi[hit].astype(np.int32))
    out[out == M] = -1
    return out

def med(fn, reps=9):
    ts = []
    for _ in range(reps):
        t = time.perf_counter(); r = fn(); ts.append(time.perf_counter() - t)
    return float(np.median(ts)), r

# ---------------------------------------------------------------- nested loop
def nested():
    out = np.full(N, -1, np.int32)
    for j in range(M - 1, -1, -1):
        out[shapely.contains_xy(zones[j], X, Y)] = j
    return out
t = time.perf_counter(); truth = nested(); t_nested = time.perf_counter() - t
print("nested", round(t_nested, 2), "s  unmatched", int((truth < 0).sum()), flush=True)
stats = {"nested": {"tests": N * M, "time": t_nested}}

# ---------------------------------------------------------------- R-tree
def rtree():
    tree = shapely.STRtree(zones)
    pi, zi = tree.query(shapely.points(X, Y))
    hit = shapely.contains_xy(zones[zi], X[pi], Y[pi])
    return assign(N, pi, zi, hit), len(pi)
t_rt, (res, ncand_rt) = med(rtree)
assert (res == truth).all()
stats["rtree"] = {"tests": int(ncand_rt), "time": t_rt}
print("rtree", round(t_rt, 3), "s tests", ncand_rt, flush=True)

# ---------------------------------------------------------------- grids
ztree = shapely.STRtree(zones)
bx0, by0, bx1, by1 = shapely.total_bounds(zones)
mg = 5.0
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
    poly = h3.LatLngPoly([(la, lo_) for lo_, la in ring[:-1]])
    out = []
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

P = shapely.points(X, Y)
GR = {"geohash": (cells_geohash, [5, 6, 7]), "s2": (cells_s2, [12, 13, 14, 15, 16]),
      "h3": (cells_h3, [7, 8, 9, 10]), "a5": (cells_a5, [12, 13, 14, 15, 16])}
SHOW = {"geohash": 7, "s2": 16, "h3": 10, "a5": 15}
ZC = km(-73.989, 40.737); ZS = 2.0
grids = {}
for name, (fn, levels) in GR.items():
    for lv in levels:
        t0 = time.perf_counter()
        carr = fn(lv)
        ci, zj = ztree.query(carr, predicate="intersects")
        keep = shapely.area(shapely.intersection(carr[ci], zones[zj])) > 1e-12
        ci, zj = ci[keep], zj[keep]
        used = np.unique(ci)                          # cells that touch a zone
        remap = np.full(len(carr), -1); remap[used] = np.arange(len(used))
        carr = carr[used]; ci = remap[ci]
        o = np.lexsort((zj, ci)); ci, zj = ci[o], zj[o]
        ncand = np.bincount(ci, minlength=len(carr))
        starts = np.r_[0, np.cumsum(ncand)]
        first = zj[starts[:-1]]
        inside = shapely.contains_properly(zones[first], carr) & (ncand == 1)
        owner = np.where(inside, first, -1).astype(np.int32)
        # the stored cell column for the points
        qi, qc = shapely.STRtree(carr).query(P, predicate="intersects")
        cell_of = np.full(N, -1, np.int64); cell_of[qi[::-1]] = qc[::-1]
        t_build = time.perf_counter() - t0
        owner_p = np.r_[owner, -1]; ncand_p = np.r_[ncand, 0]

        def join():
            own = owner_p[cell_of]
            out = own.copy()
            need = np.flatnonzero((own < 0) & (ncand_p[cell_of] > 0))
            cn = cell_of[need]; cnt = ncand[cn]
            pp = np.repeat(need, cnt)
            off = np.arange(len(pp)) - np.repeat(np.cumsum(cnt) - cnt, cnt)
            pz = zj[np.repeat(starts[cn], cnt) + off]
            hit = shapely.contains_xy(zones[pz], X[pp], Y[pp])
            sub = np.full(N, M, np.int32); np.minimum.at(sub, pp[hit], pz[hit].astype(np.int32))
            out[need] = np.where(sub[need] == M, -1, sub[need])
            return out, len(pp)
        tj, (res, tests) = med(join)
        bad = int((res != truth).sum())
        settled = float((owner_p[cell_of] >= 0).mean())
        areas = shapely.area(carr)
        key = f"{name}_{lv}"
        stats[key] = {"grid": name, "level": lv, "tests": int(tests), "time": tj, "settled": settled,
                      "cell_km2": float(areas.mean()), "ncells": int(len(carr)), "mismatch": bad, "build": t_build}
        print(key, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in stats[key].items()}, flush=True)
        if SHOW[name] == lv:
            c = shapely.centroid(carr); cx, cy = shapely.get_x(c), shapely.get_y(c)
            near = (abs(cx - ZC[0]) < ZS / 2 + 0.5) & (abs(cy - ZC[1]) < ZS / 2 + 0.5)
            grids[name] = {"cells": [np.array(g.exterior.coords) for g in carr[near]], "interior": inside[near],
                           "ncand": ncand[near], "level": lv}
            stats[name] = stats[key]

rings = []
for z in zones:
    parts = z.geoms if z.geom_type == "MultiPolygon" else [z]
    rings.append([np.array(shapely.simplify(p, 0.01).exterior.coords) for p in parts])
rng = np.random.default_rng(3)
samp = rng.choice(N, 12000, replace=False)
zm = np.flatnonzero((abs(X - ZC[0]) < ZS / 2 + 0.1) & (abs(Y - ZC[1]) < ZS / 2 + 0.1))
zs = rng.choice(zm, min(len(zm), 6000), replace=False)
pickle.dump({"N": N, "M": M, "districts": rings, "names": names, "bboxes": np.array([z.bounds for z in zones]),
             "bounds": (bx0, by0, bx1, by1), "stats": stats, "grids": grids, "px": X, "py": Y, "truth": truth,
             "samp": samp, "zsamp": zs, "zoom": (float(ZC[0]), float(ZC[1]), ZS)}, open("data.pkl", "wb"))
import json, os
os.makedirs("data", exist_ok=True)
json.dump({"points": N, "zones": M, "unmatched": int((truth < 0).sum()), "methods": stats}, open("data/results.json", "w"), indent=1)
print("saved")
