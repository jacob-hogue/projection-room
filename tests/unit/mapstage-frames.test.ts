import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Topology } from 'topojson-specification';
import { loadLineage } from '../../src/lib/lineage';
import { MapStage, DIM_OPACITY } from '../../src/lib/mapstage';
import { PALETTES } from '../../src/lib/palette';
import lineageFixture from '../fixtures/lineage-stage.json';

/**
 * Frame-driven setters: the film renders one frame at a time and the stepper lands every
 * step on a complete state, so each of these must be deterministic for a given progress.
 */
const topo = JSON.parse(readFileSync('tests/fixtures/areas-small.topojson', 'utf8')) as Topology;
const lineage = loadLineage(lineageFixture);

let svg: SVGSVGElement;
let stage: MapStage;
const area = (npa: string) => svg.querySelector<SVGPathElement>(`path.area[data-npa="${npa}"]`)!;

beforeEach(() => {
  document.body.innerHTML = '';
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  stage = new MapStage(svg, topo, { width: 600, height: 300, palette: PALETTES.signature, lineage });
});

describe('MapStage frame setters', () => {
  test('warm prepares every year once so later year changes do no geometry work', async () => {
    expect(stage.cachedYears()).toBeLessThan(5);
    await stage.warm();
    expect(stage.cachedYears()).toBe(2025 - 1947 + 1);
  });

  test('cameraAt interpolates from the whole map to a territory and back', () => {
    stage.setYear(2000);
    stage.cameraAt('718', 0);
    expect(stage.state().zoom).toBe(1);
    stage.cameraAt('718', 1);
    const full = stage.state().zoom;
    expect(full).toBeGreaterThan(1);
    stage.cameraAt('718', 0.5);
    const half = stage.state().zoom;
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(full);
    stage.cameraAt(null, 1);
    expect(stage.state().zoom).toBe(1);
  });

  test('revealAt shows territories in order as progress runs 0 to 1', () => {
    stage.setYear(1947);
    stage.setBlank(true, 0);
    stage.revealAt(['516', '212', '718'], 0);
    for (const npa of ['212', '718', '516']) expect(Number(area(npa).getAttribute('opacity'))).toBe(0);
    stage.revealAt(['516', '212', '718'], 0.5);
    expect(Number(area('516').getAttribute('opacity'))).toBe(1);
    expect(Number(area('718').getAttribute('opacity'))).toBeLessThan(1);
    stage.revealAt(['516', '212', '718'], 1);
    for (const npa of ['212', '718', '516']) expect(Number(area(npa).getAttribute('opacity'))).toBe(1);
    expect(svg.getAttribute('data-blank')).toBe('false');
  });

  test('dimAt fades the rest toward the dim level and halos the subject by progress', () => {
    stage.setYear(2000);
    stage.dimAt(['718'], 0);
    expect(Number(area('212').getAttribute('opacity'))).toBe(1);
    stage.dimAt(['718'], 1);
    expect(Number(area('212').getAttribute('opacity'))).toBeCloseTo(DIM_OPACITY, 5);
    expect(Number(area('718').getAttribute('opacity'))).toBe(1);
    expect(Number(svg.querySelector('g.halos path')!.getAttribute('stroke-opacity'))).toBeGreaterThan(0);
    stage.dimAt(['718'], 0.5);
    const mid = Number(area('212').getAttribute('opacity'));
    expect(mid).toBeGreaterThan(DIM_OPACITY);
    expect(mid).toBeLessThan(1);
    stage.dimAt(null, 1);
    expect(Number(area('212').getAttribute('opacity'))).toBe(1);
    expect(svg.querySelectorAll('g.halos path').length).toBe(0);
  });

  test('settle applies a complete state at once: year, mode, blank off, no focus, no zoom', () => {
    stage.setBlank(true, 0);
    stage.zoomTo('718', 0);
    stage.focus(['718'], 0);
    stage.settle({ year: 1990, mode: 'middle', labels: true });
    expect(svg.getAttribute('data-year')).toBe('1990');
    expect(svg.getAttribute('data-mode')).toBe('middle');
    expect(svg.getAttribute('data-blank')).toBe('false');
    expect(stage.state().zoom).toBe(1);
    expect(svg.querySelectorAll('g.halos path').length).toBe(0);
    for (const npa of ['212', '718', '516']) expect(area(npa).getAttribute('opacity')).toBe('1');
    expect(svg.querySelectorAll('text.label').length).toBe(1);
  });
});

describe('MapStage atlas layers', () => {
  test('state lines draw under the territory outlines when a states topology is given', () => {
    const states = JSON.parse(readFileSync('tests/fixtures/states-small.topojson', 'utf8')) as Topology;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(el);
    const s = new MapStage(el, topo, { width: 600, height: 300, palette: PALETTES.signature, lineage, states });
    const lines = el.querySelectorAll('g.states path');
    expect(lines.length).toBe(1);
    expect(lines[0].getAttribute('d')).toMatch(/^M/);
    const order = [...el.querySelectorAll('g.view > g')].map((g) => g.getAttribute('class'));
    expect(order.indexOf('states')).toBeGreaterThan(order.indexOf('areas'));
    expect(order.indexOf('states')).toBeLessThan(order.indexOf('outlines'));
    expect(s.state().zoom).toBe(1);
  });

  test('zoomTo accepts how much of the stage the territory should fill', () => {
    stage.setYear(2000);
    stage.zoomTo('718', 0);
    const tight = stage.state().zoom;
    stage.zoomTo('718', 0, 0.5);
    expect(stage.state().zoom).toBeLessThan(tight);
    expect(stage.state().zoom).toBeGreaterThan(1);
  });
});
