import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Topology } from 'topojson-specification';
import { loadLineage } from '../../src/lib/lineage';
import { MapStage } from '../../src/lib/mapstage';
import { PALETTES, pulseColor } from '../../src/lib/palette';
import lineageFixture from '../fixtures/lineage-stage.json';

const topo = JSON.parse(readFileSync('tests/fixtures/areas-small.topojson', 'utf8')) as Topology;
const lineage = loadLineage(lineageFixture);

let svg: SVGSVGElement;
let stage: MapStage;
const area = (npa: string) => svg.querySelector<SVGPathElement>(`path.area[data-npa="${npa}"]`)!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  document.body.innerHTML = '';
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  stage = new MapStage(svg, topo, { width: 600, height: 300, palette: PALETTES.signature, lineage });
});

describe('MapStage motion', () => {
  test('all drawn layers sit in one view group the camera can move', () => {
    const view = svg.querySelector('g.view')!;
    expect(view).not.toBeNull();
    for (const cls of ['areas', 'outlines', 'coast', 'labels']) expect(view.querySelector(`g.${cls}`), cls).not.toBeNull();
    expect(svg.querySelector(':scope > g.legend')).not.toBeNull(); // the legend stays put
  });

  test('zoomTo a display code scales the view and zoomTo(null) resets it', () => {
    stage.setYear(2000);
    stage.zoomTo('718', 0);
    expect(stage.state().zoom).toBeGreaterThan(1);
    expect(svg.querySelector('g.view')!.getAttribute('transform')).toMatch(/scale\(/);
    stage.zoomTo(null, 0);
    expect(stage.state().zoom).toBe(1);
  });

  test('focus dims the rest, halos the subject, and clears', () => {
    stage.setYear(2000);
    stage.focus(['718'], 0);
    expect(area('212').getAttribute('opacity')).toBe('0.22');
    expect(area('718').getAttribute('opacity')).toBe('1');
    expect(svg.querySelectorAll('g.halos path').length).toBeGreaterThanOrEqual(2);
    expect(svg.querySelector('g.halos path')!.getAttribute('stroke')).toBe(area('718').getAttribute('fill'));
    stage.focus(null, 0);
    expect(svg.querySelectorAll('g.halos path').length).toBe(0);
    expect(area('212').getAttribute('opacity')).toBe('1');
  });

  test('setBlank hides the data layers and reveal brings territories back in a given order', async () => {
    stage.setYear(1947);
    stage.setBlank(true, 0);
    expect(svg.getAttribute('data-blank')).toBe('true');
    expect(area('212').getAttribute('opacity')).toBe('0');
    const done = stage.reveal(['516', '212', '718'], { step: 5, duration: 10 });
    expect(area('516').getAttribute('data-reveal')).toBe('0');
    expect(area('718').getAttribute('data-reveal')).toBe('2');
    await done;
    expect(svg.getAttribute('data-blank')).toBe('false');
    for (const npa of ['212', '718', '516']) expect(area(npa).getAttribute('opacity')).toBe('1');
  });

  test('setYear with a duration tweens the fill and lands on the exact color', async () => {
    stage.setYear(1947, 0);
    const before = area('718').getAttribute('fill');
    stage.setYear(2000, 40);
    expect(area('718').getAttribute('fill')).toBe(before); // nothing jumps on the same tick
    await wait(160);
    expect(area('718').getAttribute('fill')).toBe(pulseColor(PALETTES.signature, 16));
    expect(svg.getAttribute('data-year')).toBe('2000');
  });

  test('territories whose code changed are marked new for a moment', () => {
    stage.setYear(1947, 0);
    stage.setYear(1990, 0);
    expect(area('718').classList.contains('is-new')).toBe(true);
    expect(area('212').classList.contains('is-new')).toBe(false);
  });

  test('anchor gives stage coordinates for a display code in the current year', () => {
    stage.setYear(2000);
    const a = stage.anchor('212')!;
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(200);
    expect(stage.anchor('999')).toBeNull();
  });

  test('codesFor lists every code a territory carries this year', () => {
    stage.setYear(2000);
    expect(stage.codesFor('718')).toEqual(['718', '347']);
  });
});
