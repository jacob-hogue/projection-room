import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test } from 'vitest';
import type { Topology } from 'topojson-specification';
import { loadLineage } from '../../src/lib/lineage';
import { MapStage, type HoverInfo } from '../../src/lib/mapstage';
import { PALETTES } from '../../src/lib/palette';
import lineageFixture from '../fixtures/lineage-stage.json';

const topo = JSON.parse(readFileSync('tests/fixtures/areas-small.topojson', 'utf8')) as Topology;
const lineage = loadLineage(lineageFixture);

let svg: SVGSVGElement;
let stage: MapStage;

const fill = (npa: string) => svg.querySelector(`path.area[data-npa="${npa}"]`)!.getAttribute('fill');
const cls = (npa: string) => svg.querySelector(`path.area[data-npa="${npa}"]`)!.getAttribute('data-class');

beforeEach(() => {
  document.body.innerHTML = '';
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svg);
  stage = new MapStage(svg, topo, { width: 600, height: 300, palette: PALETTES.signature, lineage });
});

describe('MapStage', () => {
  test('renders one path per polygon and dissolves outlines by display code', () => {
    stage.setYear(1947);
    expect(svg.querySelectorAll('path.area').length).toBe(3);
    expect(svg.querySelectorAll('path.outline').length).toBe(1);
    stage.setYear(2000);
    expect(svg.querySelectorAll('path.area').length).toBe(3);
    expect(svg.querySelectorAll('path.outline').length).toBe(3);
    expect(svg.getAttribute('data-year')).toBe('2000');
  });

  test('every area path has a projected d attribute', () => {
    stage.setYear(1947);
    for (const p of svg.querySelectorAll('path.area')) expect(p.getAttribute('d')).toMatch(/^M/);
  });

  test('year change recolors without changing geometry', () => {
    stage.setYear(1947);
    const a = fill('718');
    const d = svg.querySelector('path.area[data-npa="718"]')!.getAttribute('d');
    stage.setYear(2000);
    expect(fill('718')).not.toBe(a);
    expect(svg.querySelector('path.area[data-npa="718"]')!.getAttribute('d')).toBe(d);
  });

  test('polygons that share a display code share a fill', () => {
    stage.setYear(1947);
    expect(fill('718')).toBe(fill('212'));
    expect(fill('516')).toBe(fill('212'));
  });

  test('overlay adds a hatch right after its area', () => {
    stage.setYear(2000);
    expect(svg.querySelector('path.area[data-npa="718"] + path.hatch')).not.toBeNull();
    expect(svg.querySelector('path.area[data-npa="212"] + path.hatch')).not.toBeNull();
    expect(svg.querySelector('path.area[data-npa="516"] + path.hatch')).toBeNull();
    stage.setYear(1990);
    expect(svg.querySelectorAll('path.hatch').length).toBe(0);
  });

  test('middle mode buckets codes assigned after 1947 as later', () => {
    stage.setMode('middle');
    stage.setYear(2000);
    expect(cls('718')).toBe('later');
    expect(cls('516')).toBe('later');
    expect(cls('212')).toBe('subdivided');
    expect(fill('718')).toBe(PALETTES.signature.middle.later);
    stage.setYear(1947);
    expect(cls('718')).toBe('subdivided');
  });

  test('year mode colors by the display code year', () => {
    stage.setMode('year');
    stage.setYear(2000);
    expect(fill('212')).toBe(PALETTES.signature.ramp(0));
    expect(fill('718')).not.toBe(fill('212'));
  });

  test('setPalette recolors', () => {
    stage.setYear(1947);
    const a = fill('212');
    stage.setPalette(PALETTES.mono);
    expect(fill('212')).not.toBe(a);
    expect(stage.state().palette).toBe('mono');
  });

  test('labels mark the fastest 1947 codes at their centroids', () => {
    stage.setYear(1947);
    stage.setLabels(true);
    const labels = svg.querySelectorAll('text.label');
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('212');
    expect(Number(labels[0].getAttribute('x'))).toBeGreaterThan(0);
    stage.setLabels(false);
    expect(svg.querySelectorAll('text.label').length).toBe(0);
  });

  test('hover reports the polygon and clears on leave', () => {
    const seen: (HoverInfo | null)[] = [];
    stage.onHover((info) => seen.push(info));
    stage.setYear(2000);
    const p = svg.querySelector('path.area[data-npa="718"]')!;
    p.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    p.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    expect(seen).toEqual([{ npa: '718', codes: ['718', '347'], pulses: 16, original: '212' }, null]);
  });

  test('toSVG is standalone', () => {
    stage.setYear(1947);
    const out = stage.toSVG();
    expect(out).toMatch(/^<svg[^>]+xmlns=/);
    expect(out).toContain('<style');
    expect(out).toContain('class="area"');
  });

  test('state reports year, mode and palette', () => {
    stage.setYear(1999);
    stage.setMode('year');
    expect(stage.state()).toEqual({ year: 1999, mode: 'year', palette: 'signature' });
  });
});
