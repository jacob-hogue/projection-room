import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import { loadLineage, originalOf } from '../../src/lib/lineage';

/**
 * Guards the published TopoJSON. When neighbours' shared edges do not coincide exactly,
 * topojson.merge leaves open ring fragments; the renderer closes them with straight legs
 * that draw as spikes. Every ring, in every feature and every merge, must close on itself.
 */
const topo = JSON.parse(readFileSync('pieces/dial-pulse/data/areas.topojson', 'utf8')) as Topology;
const lineage = loadLineage(JSON.parse(readFileSync('pieces/dial-pulse/data/lineage.json', 'utf8')));
const areas = topo.objects.areas as GeometryCollection<{ npa: string | number }>;

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
  test('every territory decodes to closed rings', () => {
    const fc = feature(topo, areas);
    const bad = fc.features
      .map((f, i) => [String(areas.geometries[i].properties?.npa), openRings(f.geometry as GeoJSON.Polygon)] as const)
      .filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('merged 1947 outlines are closed rings', () => {
    const groups = new Map<string, (Polygon | MultiPolygon)[]>();
    for (const g of areas.geometries) {
      if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') continue;
      const o = originalOf(String(g.properties?.npa), lineage);
      groups.set(o, [...(groups.get(o) ?? []), g]);
    }
    const bad = [...groups].map(([o, gs]) => [o, openRings(merge(topo, gs))] as const).filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('every territory merges to closed rings on its own', () => {
    const bad = areas.geometries
      .filter((g): g is Polygon | MultiPolygon => g.type === 'Polygon' || g.type === 'MultiPolygon')
      .map((g) => [String(g.properties?.npa), openRings(merge(topo, [g]))] as const)
      .filter(([, n]) => n > 0);
    expect(bad).toEqual([]);
  });

  test('territory count matches the lineage table', () => {
    const npas = new Set(areas.geometries.map((g) => String(g.properties?.npa)));
    for (const npa of npas) expect(lineage.codes[npa], npa).toBeDefined();
    expect(npas.size).toBeGreaterThan(230);
  });
});
