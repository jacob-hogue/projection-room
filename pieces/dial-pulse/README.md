# The dial-pulse map

Area codes of the lower 48 states, colored by how many clicks it took to dial them on a rotary phone, from the 1947 plan to 2025. Watch at [jacob-hogue.github.io/projection-room/dial-pulse](https://jacob-hogue.github.io/projection-room/dial-pulse/).

Data: North America Telephone Area Code Boundaries (UCLA Geoportal, 2015), NANPA, Natural Earth, the Census Bureau.

```sh
cd pipeline && pip install -r requirements.txt && make all && make test && make poster
cd ../film && npm install && npm run render
```
