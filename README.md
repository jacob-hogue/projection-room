# The Projection Room

Interactive maps and short films by Jacob Hogue, published at [jacob-hogue.github.io/projection-room](https://jacob-hogue.github.io/projection-room/). Each piece is built from one public dataset, and the data pipeline, the method and the sources are published with it.

## Pieces

- `pieces/spatial-join/`: the spatial join. A million Uber pickups matched to New York's 263 taxi zones by brute force, an R-tree and four grid indexes (Geohash, S2, H3, A5), with a benchmark that compares them at equal cell size.
- `pieces/dial-pulse/`: the dial-pulse map. Area codes of the lower 48 states, colored by how many clicks it took to dial them on a rotary phone, from the 1947 plan to 2025.

## Layout

- `src/`: the Astro site (layouts, components, the piece pages, the D3 map stage in `src/lib/`).
- `pieces/<piece>/pipeline/`: the Python pipeline that downloads, cleans and exports that piece's data, with its tests. `make all` in that folder rebuilds the data; `make poster` renders the poster from the built site.
- `pieces/<piece>/data/`: the exported files the site serves (copied into `public/` before every build).
- `tests/`: Vitest unit tests for the browser code and Playwright tests for the pages.

## Build

```sh
npm install
npm run build        # also copies piece data into public/
npm run preview      # serves the build at http://localhost:4321/projection-room/
npm test             # unit tests
npm run e2e          # page tests against the build
```

The pipeline needs Python 3.11 with the packages in `pieces/dial-pulse/pipeline/requirements.txt` (GeoPandas, Shapely 2.2 on GEOS 3.14, pyogrio, Pillow) and Node 22 for the TopoJSON writer.

## Deploying

GitHub Pages, from the `deploy` workflow, run by hand.
