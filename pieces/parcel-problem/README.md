# The Parcel Problem

A county keeps five copies of its parcel map. One database and a nightly update bring them together. Watch at [jacob-hogue.github.io/projection-room/parcel-problem](https://jacob-hogue.github.io/projection-room/parcel-problem/).

Data: MassGIS Standardized Assessors' Parcels (feature service) and MassGIS town boundaries.

```sh
cd pipeline && pip install -r requirements.txt && make all && make test
cd ../film && npm install && npm run render
```
