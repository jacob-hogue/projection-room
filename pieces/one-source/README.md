# One Source

A county keeps five copies of its parcel map. One database and a nightly job replace all of them. The film ends on the layer Massachusetts already runs at the scale of a state. Page: [jacob-hogue.github.io/projection-room/one-source](https://jacob-hogue.github.io/projection-room/one-source/).

## Rebuild the data

```sh
cd pipeline
pip install -r requirements.txt     # Python 3.11
make all                            # download, prepare
make test                           # pytest
```

Downloads are cached in the repository's `.cache/one-source/` folder and never committed. `make all` writes:

- `data/towns.topojson`: the 351 cities and towns in EPSG:26986, simplified at 60 m, each with its fee and tax parcel count, the share of parcels edited in 2023 or later, and the latest edit date.
- `data/parcels.topojson`: Westborough's fee and tax parcels with their last-edit year and date.
- `data/stats.json`: statewide totals by edit-date band, the town-freshness buckets, and the Westborough summary the film's pipeline chapter reads.

The film is a Remotion project in `film/`: `npm install`, then `npm run render`. `npm run render:slice -- 90 102` renders a few seconds for a quick look.

## Data recipe

1. Parcel statistics: the MassGIS Massachusetts Property Tax Parcels feature service, statistics grouped by `TOWN_ID` over fee and tax polygons: count, latest fiscal year, first and last `LAST_EDIT`, and a count per edit-date band (before 2015, 2015 to 2019, 2020 to 2022, 2023 to 2024, 2025 on).
2. Westborough parcels: the same service, `TOWN_ID = 328`, fee and tax polygons, 2,000 rows a page, in EPSG:26986.
3. Town boundaries: MassGIS Community Boundaries (Towns) from Survey Points, `TOWNSSURVEY_POLYM`.
4. TopoJSON is written by `scripts/topo.mjs` (topojson-server, Visvalingam simplification on shared arcs, quantization 100,000).

## Known gaps

- The service is a live layer; the numbers are what it returned on the run date in `stats.json`. One town reports a last-edit date in 2036, which the pipeline clamps to the run date.
- Freshness is the share of a town's parcels edited in 2023 or later. It says how much of the town's map has been touched recently, not how accurate it is.
- The county in the film's first chapters is a composite; the captions say so.
