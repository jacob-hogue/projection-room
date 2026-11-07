/**
 * The D3 renderer for the dial-pulse map. Geometry arrives pre-projected (EPSG:5070) in a
 * TopoJSON, so the projection is an identity fit to the stage; changing the year only
 * recolors and redraws dissolved outlines, never re-projects.
 *
 * Layers, bottom to top: water, areas (with hatches), territory outlines (dark casing
 * under a light line), the coast (soft glow under a thin light edge), labels, legend.
 */
import { geoIdentity, geoPath, select, type GeoPath, type GeoProjection, type Selection } from 'd3';
import polylabel from 'polylabel';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, GeometryObject, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import { displayCode, hasOverlay, originalOf, polygonCodes, type Lineage } from './lineage';
import { PULSE_MAX, PULSE_MIN, RAMP_STEPS, pulseColor, type Palette } from './palette';
import { middleDigitClass, pulses, type MiddleDigitClass } from './pulses';

export type Mode = 'pulses' | 'middle' | 'year';

export interface StageOptions {
  width: number;
  height: number;
  palette: Palette;
  lineage: Lineage;
}

export interface HoverInfo {
  npa: string;
  codes: string[];
  pulses: number;
  original: string;
}

export const YEAR_MIN = 1947;
export const YEAR_MAX = 2025;
export const LABEL_COUNT = 5;

/** Cities for the 1947 codes worth naming on the map, fastest first. */
export const LABEL_CITIES: Record<string, string> = {
  '212': 'New York',
  '213': 'Los Angeles',
  '312': 'Chicago',
  '214': 'Dallas',
  '313': 'Detroit',
  '215': 'Philadelphia',
  '216': 'Cleveland',
  '314': 'St. Louis',
  '412': 'Pittsburgh',
  '415': 'San Francisco',
};

const SURFACE = '#0f1117';
const WATER = '#0a0c11';
const TEXT = '#e8eaed';
const TEXT_2 = '#8b8fa3';
const SVG_NS = 'http://www.w3.org/2000/svg';
const SANS = '"DM Sans", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

const AREA_SEAM = 0.6;
const CASING_WIDTH = 1.6;
const LINE_WIDTH = 0.5;
const COAST_GLOW_WIDTH = 3;
const COAST_WIDTH = 0.6;

const EMBEDDED_STYLE = [
  `.mapstage{background:${SURFACE}}`,
  '.area{stroke-linejoin:round}',
  `.area.is-hover{stroke:${TEXT};stroke-width:1.2}`,
  '.hatch,.outline-casing,.outline,.coast,.label,.legend{pointer-events:none}',
  `.label-city{font:600 12px ${SANS}}`,
  `.label-code{font:500 11px ${MONO}}`,
  `.legend text{font:500 10px ${MONO}}`,
].join('\n');

interface Poly {
  npa: string;
  geom: Polygon | MultiPolygon;
  d: string;
}

interface Entry {
  kind: 'area' | 'hatch';
  poly: Poly;
  codes: string[];
  display: string;
  fill: string;
  cls: MiddleDigitClass;
}

interface Outline {
  code: string;
  d: string;
  /** Pole of inaccessibility of the largest part, in stage pixels. */
  anchor: [number, number];
}

export class MapStage {
  private readonly root: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly areas: Selection<SVGGElement, unknown, null, undefined>;
  private readonly casings: Selection<SVGGElement, unknown, null, undefined>;
  private readonly lines: Selection<SVGGElement, unknown, null, undefined>;
  private readonly labels: Selection<SVGGElement, unknown, null, undefined>;
  private readonly legend: Selection<SVGGElement, unknown, null, undefined>;
  private readonly projection: GeoProjection;
  private readonly path: GeoPath;
  private readonly polys: Poly[];
  private readonly topology: Topology;
  private readonly lineage: Lineage;
  private readonly width: number;
  private readonly height: number;
  private readonly outlineCache = new Map<number, Outline[]>();
  private readonly labelCodes: string[];
  private palette: Palette;
  private year = YEAR_MIN;
  private mode: Mode = 'pulses';
  private labelsOn = false;
  private legendOn = false;
  private hoverCb: ((info: HoverInfo | null) => void) | null = null;

  constructor(svg: SVGSVGElement, topology: Topology, opts: StageOptions) {
    this.topology = topology;
    this.lineage = opts.lineage;
    this.palette = opts.palette;
    this.width = opts.width;
    this.height = opts.height;

    const object = topology.objects.areas as GeometryCollection<{ npa: string | number }>;
    const collection = feature(topology, object);
    this.projection = geoIdentity().reflectY(true).fitSize([opts.width, opts.height], collection) as unknown as GeoProjection;
    this.path = geoPath(this.projection);
    this.polys = object.geometries
      .filter((g): g is (Polygon | MultiPolygon) & { properties: { npa: string | number } } =>
        g.type === 'Polygon' || g.type === 'MultiPolygon')
      .map((geom, i) => ({
        npa: String(geom.properties?.npa ?? '').padStart(3, '0'),
        geom,
        d: this.path(collection.features[i]) ?? '',
      }));

    this.root = select(svg)
      .attr('class', 'mapstage')
      .attr('viewBox', `0 0 ${opts.width} ${opts.height}`)
      .attr('width', opts.width)
      .attr('height', opts.height)
      .attr('role', 'img');
    this.root
      .append('defs')
      .append('pattern')
      .attr('id', 'hatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 4)
      .attr('height', 4)
      .attr('patternTransform', 'rotate(45)')
      .append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 4)
      .attr('stroke', SURFACE)
      .attr('stroke-opacity', 0.38)
      .attr('stroke-width', 1.1);
    this.root.append('rect').attr('class', 'water').attr('width', opts.width).attr('height', opts.height).attr('fill', WATER);
    this.areas = this.root.append('g').attr('class', 'areas');
    const outlines = this.root.append('g').attr('class', 'outlines');
    this.casings = outlines.append('g').attr('class', 'outline-casings');
    this.lines = outlines.append('g').attr('class', 'outline-lines');
    this.drawCoast(object);
    this.labels = this.root.append('g').attr('class', 'labels');
    this.legend = this.root.append('g').attr('class', 'legend');

    this.labelCodes = this.fastestOriginals();
    this.render();
  }

  setYear(year: number): void {
    this.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    this.render();
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.render();
  }

  setPalette(p: Palette): void {
    this.palette = p;
    this.render();
  }

  setLabels(on: boolean): void {
    this.labelsOn = on;
    this.renderLabels();
  }

  setLegend(on: boolean): void {
    this.legendOn = on;
    this.renderLegend();
  }

  onHover(cb: (info: HoverInfo | null) => void): void {
    this.hoverCb = cb;
  }

  state(): { year: number; mode: Mode; palette: string } {
    return { year: this.year, mode: this.mode, palette: this.palette.name };
  }

  /** A standalone SVG document with the styles embedded. */
  toSVG(): string {
    const clone = this.root.node()!.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', SVG_NS);
    const style = clone.ownerDocument.createElementNS(SVG_NS, 'style');
    style.textContent = EMBEDDED_STYLE;
    clone.insertBefore(style, clone.firstChild);
    const out = new XMLSerializer().serializeToString(clone);
    return out.startsWith('<svg') ? out : out.slice(out.indexOf('<svg'));
  }

  private drawCoast(object: GeometryCollection): void {
    // Exterior arcs only: arcs with the same polygon on both sides are the land edge.
    const d = this.path(mesh(this.topology, object, (a, b) => a === b)) ?? '';
    const g = this.root.append('g').attr('class', 'coast');
    g.append('path')
      .attr('class', 'coast coast-glow')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', TEXT)
      .attr('stroke-opacity', 0.12)
      .attr('stroke-width', COAST_GLOW_WIDTH)
      .attr('stroke-linejoin', 'round');
    g.append('path')
      .attr('class', 'coast coast-edge')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', TEXT)
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', COAST_WIDTH)
      .attr('stroke-linejoin', 'round');
  }

  private fastestOriginals(): string[] {
    const present = new Set(this.polys.map((p) => originalOf(p.npa, this.lineage)));
    return [...present].sort((a, b) => pulses(a) - pulses(b) || Number(a) - Number(b)).slice(0, LABEL_COUNT);
  }

  private classify(display: string): MiddleDigitClass {
    return this.lineage.codes[display].year > YEAR_MIN ? 'later' : middleDigitClass(display);
  }

  private colorFor(display: string, cls: MiddleDigitClass): string {
    switch (this.mode) {
      case 'pulses':
        return pulseColor(this.palette, pulses(display));
      case 'middle':
        return this.palette.middle[cls];
      case 'year':
        return this.palette.ramp((this.lineage.codes[display].year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN));
    }
  }

  private entries(): Entry[] {
    const out: Entry[] = [];
    for (const poly of this.polys) {
      const codes = polygonCodes(poly.npa, this.year, this.lineage);
      const display = displayCode(codes, this.year, this.lineage);
      const cls = this.classify(display);
      const fill = this.colorFor(display, cls);
      out.push({ kind: 'area', poly, codes, display, fill, cls });
      if (hasOverlay(codes, this.year, this.lineage)) out.push({ kind: 'hatch', poly, codes, display, fill, cls });
    }
    return out;
  }

  /** Pole of inaccessibility of the largest part, projected to stage pixels. */
  private anchorFor(merged: GeoJSON.MultiPolygon): [number, number] {
    let best: number[][][] | null = null;
    let bestArea = -1;
    for (const part of merged.coordinates) {
      const area = Math.abs(ringArea(part[0]));
      if (area > bestArea) {
        bestArea = area;
        best = part;
      }
    }
    const pole = best ? polylabel(best as [number, number][][], 500) : [0, 0];
    const projected = this.projection([pole[0], pole[1]]) ?? [0, 0];
    return [projected[0], projected[1]];
  }

  private outlinesFor(year: number): Outline[] {
    const cached = this.outlineCache.get(year);
    if (cached) return cached;
    const byCode = new Map<string, Poly[]>();
    for (const poly of this.polys) {
      const codes = polygonCodes(poly.npa, year, this.lineage);
      const display = displayCode(codes, year, this.lineage);
      byCode.set(display, [...(byCode.get(display) ?? []), poly]);
    }
    const out: Outline[] = [];
    for (const [code, polys] of byCode) {
      const merged = merge(this.topology, polys.map((p) => p.geom as GeometryObject as Polygon | MultiPolygon));
      out.push({ code, d: this.path(merged) ?? '', anchor: this.anchorFor(merged) });
    }
    out.sort((a, b) => Number(a.code) - Number(b.code));
    this.outlineCache.set(year, out);
    return out;
  }

  private render(): void {
    this.root.attr('data-year', this.year).attr('data-mode', this.mode).attr('data-palette', this.palette.name);
    const self = this;
    this.areas
      .selectAll<SVGPathElement, Entry>('path')
      .data(this.entries(), (e) => `${e.kind}:${e.poly.npa}`)
      .join((enter) =>
        enter
          .append('path')
          .attr('d', (e) => e.poly.d)
          .on('mouseenter', function (_event, e) {
            if (e.kind !== 'area') return;
            this.classList.add('is-hover');
            self.hoverCb?.({
              npa: e.poly.npa,
              codes: e.codes,
              pulses: pulses(e.display),
              original: originalOf(e.poly.npa, self.lineage),
            });
          })
          .on('mouseleave', function () {
            this.classList.remove('is-hover');
            self.hoverCb?.(null);
          }),
      )
      .attr('class', function (e) {
        return e.kind + (this.classList.contains('is-hover') ? ' is-hover' : '');
      })
      .attr('data-npa', (e) => e.poly.npa)
      .attr('data-codes', (e) => e.codes.join(','))
      .attr('data-display', (e) => e.display)
      .attr('data-class', (e) => e.cls)
      .attr('fill', (e) => (e.kind === 'area' ? e.fill : 'url(#hatch)'))
      // Stroking each area in its own fill closes the hairline seams between neighbours.
      .attr('stroke', (e) => (e.kind === 'area' ? e.fill : null))
      .attr('stroke-width', (e) => (e.kind === 'area' ? AREA_SEAM : null))
      .attr('stroke-linejoin', (e) => (e.kind === 'area' ? 'round' : null))
      .attr('pointer-events', (e) => (e.kind === 'area' ? null : 'none'))
      .order();

    const outlines = this.outlinesFor(this.year);
    this.casings
      .selectAll<SVGPathElement, Outline>('path')
      .data(outlines, (o) => o.code)
      .join('path')
      .attr('class', 'outline-casing')
      .attr('data-code', (o) => o.code)
      .attr('d', (o) => o.d)
      .attr('fill', 'none')
      .attr('stroke', SURFACE)
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', CASING_WIDTH)
      .attr('stroke-linejoin', 'round');
    this.lines
      .selectAll<SVGPathElement, Outline>('path')
      .data(outlines, (o) => o.code)
      .join('path')
      .attr('class', 'outline')
      .attr('data-code', (o) => o.code)
      .attr('d', (o) => o.d)
      .attr('fill', 'none')
      .attr('stroke', TEXT)
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', LINE_WIDTH)
      .attr('stroke-linejoin', 'round');

    this.renderLabels();
    this.renderLegend();
  }

  private renderLabels(): void {
    const outlines = this.outlinesFor(this.year);
    const shown = this.labelsOn
      ? this.labelCodes.map((code) => outlines.find((o) => o.code === code)).filter((o): o is Outline => Boolean(o))
      : [];
    const text = this.labels
      .selectAll<SVGTextElement, Outline>('text')
      .data(shown, (o) => o.code)
      .join((enter) => {
        const t = enter.append('text');
        t.append('tspan').attr('class', 'label-city');
        t.append('tspan').attr('class', 'label-code');
        return t;
      })
      .attr('class', 'label')
      .attr('x', (o) => o.anchor[0])
      .attr('y', (o) => o.anchor[1] - 2)
      .attr('fill', TEXT)
      .attr('stroke', SURFACE)
      .attr('stroke-width', 3)
      .attr('stroke-linejoin', 'round')
      .attr('paint-order', 'stroke')
      .attr('text-anchor', 'middle');
    text
      .select('.label-city')
      .attr('x', (o) => o.anchor[0])
      .attr('font-family', SANS)
      .attr('font-size', 12)
      .attr('font-weight', 600)
      .text((o) => LABEL_CITIES[o.code] ?? '');
    text
      .select('.label-code')
      .attr('x', (o) => o.anchor[0])
      .attr('dy', '1.15em')
      .attr('font-family', MONO)
      .attr('font-size', 11)
      .attr('font-weight', 500)
      .attr('fill', TEXT_2)
      .text((o) => o.code);
  }

  private renderLegend(): void {
    this.legend.selectAll('*').remove();
    if (!this.legendOn) return;
    const swatch = 9;
    const gap = 1;
    const x0 = 24;
    const y0 = this.height - 40;
    const g = this.legend.attr('transform', `translate(${x0},${y0})`);
    let items: { color: string; label: string | null }[] = [];
    let title = '';
    if (this.mode === 'pulses') {
      title = 'clicks to dial the area code';
      items = Array.from({ length: RAMP_STEPS }, (_, i) => {
        const p = PULSE_MIN + i;
        const tick = p === PULSE_MIN || p % 5 === 0 || p === PULSE_MAX;
        return { color: pulseColor(this.palette, p), label: tick ? String(p) : null };
      });
    } else if (this.mode === 'year') {
      title = 'year the code was assigned';
      items = Array.from({ length: RAMP_STEPS }, (_, i) => {
        const t = i / (RAMP_STEPS - 1);
        const year = Math.round(YEAR_MIN + t * (YEAR_MAX - YEAR_MIN));
        const tick = i === 0 || i === RAMP_STEPS - 1 || i % 6 === 0;
        return { color: this.palette.ramp(t), label: tick ? String(year) : null };
      });
    } else {
      title = 'middle digit';
      items = [
        { color: this.palette.middle.whole, label: '0, whole state' },
        { color: this.palette.middle.subdivided, label: '1, part of a state' },
        { color: this.palette.middle.later, label: 'assigned after 1947' },
      ];
    }
    g.append('text').attr('x', 0).attr('y', -8).attr('fill', TEXT_2).attr('font-family', MONO).attr('font-size', 10).text(title);
    const step = this.mode === 'middle' ? 118 : swatch + gap;
    const row = g.selectAll('g.item').data(items).join('g').attr('class', 'item').attr('transform', (_d, i) => `translate(${i * step},0)`);
    row.append('rect').attr('class', 'swatch').attr('width', swatch).attr('height', swatch).attr('fill', (d) => d.color);
    row
      .filter((d) => d.label !== null)
      .append('text')
      .attr('x', this.mode === 'middle' ? swatch + 5 : swatch / 2)
      .attr('y', this.mode === 'middle' ? swatch - 1 : swatch + 12)
      .attr('fill', TEXT_2)
      .attr('font-family', MONO)
      .attr('font-size', 10)
      .attr('text-anchor', this.mode === 'middle' ? 'start' : 'middle')
      .text((d) => d.label ?? '');
  }
}

function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}
