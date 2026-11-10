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

  test('area paths stroke in their own fill so adjacent polygons show no seam', () => {
    stage.setYear(2000);
    for (const p of svg.querySelectorAll('path.area')) {
      expect(p.getAttribute('stroke')).toBe(p.getAttribute('fill'));
      expect(Number(p.getAttribute('stroke-width'))).toBeGreaterThan(0);
    }
    for (const h of svg.querySelectorAll('path.hatch')) expect(h.getAttribute('stroke')).toBeNull();
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

  test('labels name the fastest 1947 codes with their city, placed inside the territory', () => {
    stage.setYear(2000);
    stage.setLabels(true);
    const labels = svg.querySelectorAll('text.label');
    expect(labels.length).toBe(1);
    expect(labels[0].querySelector('.label-city')?.textContent).toBe('New York');
    expect(labels[0].querySelector('.label-code')?.textContent).toBe('212');
    // In 2000 the 212 territory is the left square only: the left third of a 600 px stage.
    const x = Number(labels[0].getAttribute('x'));
    const y = Number(labels[0].getAttribute('y'));
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(200);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(300);
    stage.setLabels(false);
    expect(svg.querySelectorAll('text.label').length).toBe(0);
  });

  test('water sits under the land and the coast is cased', () => {
    stage.setYear(1947);
    const water = svg.querySelector('rect.water');
    expect(water).not.toBeNull();
    expect(water!.getAttribute('fill')).not.toBe('#0f1117');
    const coast = svg.querySelectorAll('path.coast');
    expect(coast.length).toBe(3); // blurred bloom, soft casing, then the thin light edge
    for (const c of coast) {
      expect(c.getAttribute('d')).toMatch(/^M/);
      expect(c.getAttribute('fill')).toBe('none');
    }
    // Drawn above the areas so the edge is never covered by a fill.
    const order = [...svg.querySelectorAll('g')].map((g) => g.getAttribute('class'));
    expect(order.indexOf('coast')).toBeGreaterThan(order.indexOf('areas'));
  });

  test('territory outlines are cased: a dark casing under a light line per group', () => {
    stage.setYear(2000);
    expect(svg.querySelectorAll('path.outline-casing').length).toBe(3);
    expect(svg.querySelectorAll('path.outline').length).toBe(3);
    const casing = svg.querySelector('path.outline-casing')!;
    const line = svg.querySelector('path.outline')!;
    expect(Number(casing.getAttribute('stroke-width'))).toBeGreaterThan(Number(line.getAttribute('stroke-width')));
    expect(casing.getAttribute('d')).toBe(line.getAttribute('d'));
  });

  test('legend shows one swatch per pulse count and can be hidden', () => {
    stage.setLegend(true);
    expect(svg.querySelectorAll('.legend rect.swatch').length).toBe(24);
    expect(svg.querySelector('.legend')?.textContent).toContain('5');
    expect(svg.querySelector('.legend')?.textContent).toContain('28');
    stage.setLegend(false);
    expect(svg.querySelectorAll('.legend rect.swatch').length).toBe(0);
  });

  test('hover marks the polygon', () => {
    stage.setYear(2000);
    const p = svg.querySelector('path.area[data-npa="718"]')!;
    p.dispatchEvent(new MouseEvent('mouseenter'));
    expect(p.classList.contains('is-hover')).toBe(true);
    p.dispatchEvent(new MouseEvent('mouseleave'));
    expect(p.classList.contains('is-hover')).toBe(false);
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
    expect(stage.state()).toEqual({ year: 1999, mode: 'year', palette: 'signature', zoom: 1 });
  });
});
