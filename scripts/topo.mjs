// Build the TopoJSON the page draws from a GeoJSON FeatureCollection that is already
// projected (EPSG:5070 metres), using the reference TopoJSON tools: shared arcs,
// Visvalingam simplification on those arcs, then quantization.
//
//   node topo.mjs <in.geojson> <out.topojson> <quantization> <tolerance_m> [object name]
import { readFileSync, writeFileSync } from 'node:fs';
import { quantize } from 'topojson-client';
import topojsonServer from 'topojson-server';
import topojsonSimplify from 'topojson-simplify';

// topojson-server and topojson-simplify ship as CommonJS, so Node only offers their default export.
const { topology } = topojsonServer;
const { presimplify, simplify } = topojsonSimplify;

const [, , input, output, quantizationArg, toleranceArg, objectName = 'areas'] = process.argv;
if (!input || !output) {
  console.error('usage: node topo.mjs <in.geojson> <out.topojson> [quantization] [tolerance_m]');
  process.exit(2);
}
const quantization = Number(quantizationArg ?? 1e5);
const tolerance = Number(toleranceArg ?? 0);

const collection = JSON.parse(readFileSync(input, 'utf8'));
let topo = topology({ [objectName]: collection });
if (tolerance > 0) {
  // Visvalingam weights are triangle areas; a distance tolerance maps to its square.
  topo = simplify(presimplify(topo), tolerance * tolerance);
}
topo = quantize(topo, quantization);
writeFileSync(output, JSON.stringify(topo));
console.log(`${topo.objects[objectName].geometries.length} geometries, ${topo.arcs.length} arcs -> ${output}`);
