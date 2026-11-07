import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import { loadLineage, originalOf } from '../../src/lib/lineage';

/**
 * Guards the published TopoJSON. When neighbours' shared edges do not coincide exactly,
 * or rings wind both ways, topojson.merge leaves open ring fragments; the renderer closes
 * them with straight legs that draw as spikes. Every ring, in every feature and every
 * merge, must close on itself.
 */
type Props = { npa: string | number };
type Area = Polygon<Props> | MultiPolygon<Props>;

const topo = JSON.parse(readFileSync('pieces/dial-pulse/data/areas.topojson', 'utf8')) as Topology;
const lineage = loadLineage(JSON.parse(readFileSync('pieces/dial-pulse/data/lineage.json', 'utf8')));
const areas = topo.objects.areas as GeometryCollection<Props>;
const polygons = areas.geometries.filter((g): g is Area => g.type === 'Polygon' || g.type === 'MultiPolygon');
const npaOf = (g: Area) => String(g.properties?.npa);

function openRings(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let open = 0;
  for (const poly of polys) {
    for (const ring of poly) {
      const [ax, ay] = ring[0];
      const [bx, by] = ring[ring.length - 1];
      if (Math.hypot(ax - bx, ay - by) > 1) open++;
    }
  }
  return open;
}

describe('published geometry', () => {
  test('every geometry is a polygon with a code', () => {
    expect(polygons.length).toBe(areas.geometries.length);
    for (const g of polygons) expect(npaOf(g)).toMatch(/^\d{3}$/);
  });

  test('every territory decodes to closed rings', () => {
    const bad = polygons
      .map((g) => [npaOf(g), openRings((feature(topo, g) as GeoJSON.Feature<GeoJSON.Polygon>).geometry)] as const)
      .filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('merged 1947 outlines are closed rings', () => {
    const groups = new Map<string, Area[]>();
    for (const g of polygons) {
      const o = originalOf(npaOf(g), lineage);
      groups.set(o, [...(groups.get(o) ?? []), g]);
    }
    const bad = [...groups].map(([o, gs]) => [o, openRings(merge(topo, gs))] as const).filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('every territory merges to closed rings on its own', () => {
    const bad = polygons.map((g) => [npaOf(g), openRings(merge(topo, [g]))] as const).filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('territory count matches the lineage table', () => {
    const npas = new Set(polygons.map(npaOf));
    for (const npa of npas) expect(lineage.codes[npa], npa).toBeDefined();
    expect(npas.size).toBeGreaterThan(230);
  });
});
