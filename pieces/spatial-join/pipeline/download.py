"""Download the two public inputs into a cache folder. Nothing here is committed.

  python pipeline/download.py ../../.cache/spatial-join
"""
import sys, os, urllib.request

OUT = sys.argv[1]
FILES = {
    # Uber pickups, September 2014, released by the NYC TLC to FiveThirtyEight under a FOIL request
    "uber-raw-data-sep14.csv":
        "https://raw.githubusercontent.com/fivethirtyeight/uber-tlc-foil-response/master/uber-trip-data/uber-raw-data-sep14.csv",
}
# NYC TLC taxi zones (EPSG:2263), from the copy kept in toddwschneider/nyc-taxi-data
for ext in ("shp", "dbf", "shx", "prj"):
    FILES[f"taxi_zones.{ext}"] = (
        "https://raw.githubusercontent.com/toddwschneider/nyc-taxi-data/master/shapefiles/taxi_zones/taxi_zones." + ext)

os.makedirs(OUT, exist_ok=True)
for name, url in FILES.items():
    path = os.path.join(OUT, name)
    if os.path.exists(path):
        print("have", name); continue
    print("get ", name)
    urllib.request.urlretrieve(url, path)
