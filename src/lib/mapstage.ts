/**
 * The D3 renderer for the dial-pulse map. Geometry arrives pre-projected (EPSG:5070) in a
 * TopoJSON, so the projection is an identity fit to the stage; changing the year only
 * recolors and redraws dissolved outlines, never re-projects.
 */
import { geoIdentity, geoPath, select, type GeoPath, type Selection } from 'd3';
import { feature, merge } from 'topojson-client';
import type { GeometryCollection, GeometryObject, MultiPolygon, Polygon, Topology } from 'topojson-specification';
import { displayCode, hasOverlay, originalOf, polygonCodes, type Lineage } from './lineage';
import { pulseColor, type Palette } from './palette';
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

const SURFACE = '#0f1117';
const TEXT = '#e8eaed';
const SVG_NS = 'http://www.w3.org/2000/svg';

const AREA_SEAM = 0.6;

const EMBEDDED_STYLE = [
  `.mapstage{background:${SURFACE}}`,
  '.area{stroke-linejoin:round}',
  `.outline{fill:none;stroke:${SURFACE};stroke-width:.75;stroke-linejoin:round;pointer-events:none}`,
  '.hatch{pointer-events:none}',
  `.label{font:600 11px "JetBrains Mono",ui-monospace,monospace;fill:${TEXT};paint-order:stroke;stroke:${SURFACE};stroke-width:3px;stroke-linejoin:round;text-anchor:middle;dominant-baseline:middle;pointer-events:none}`,
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
  centroid: [number, number];
}

export class MapStage {
  private readonly root: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly areas: Selection<SVGGElement, unknown, null, undefined>;
  private readonly outlines: Selection<SVGGElement, unknown, null, undefined>;
  private readonly labels: Selection<SVGGElement, unknown, null, undefined>;
  private readonly path: GeoPath;
  private readonly polys: Poly[];
  private readonly topology: Topology;
  private readonly lineage: Lineage;
  private readonly outlineCache = new Map<number, Outline[]>();
  private readonly labelCodes: string[];
  private palette: Palette;
  private year = YEAR_MIN;
  private mode: Mode = 'pulses';
  private labelsOn = false;
  private hoverCb: ((info: HoverInfo | null) => void) | null = null;

  constructor(svg: SVGSVGElement, topology: Topology, opts: StageOptions) {
    this.topology = topology;
    this.lineage = opts.lineage;
    this.palette = opts.palette;

    const object = topology.objects.areas as GeometryCollection<{ npa: string | number }>;
    const collection = feature(topology, object);
    const projection = geoIdentity().reflectY(true).fitSize([opts.width, opts.height], collection);
    this.path = geoPath(projection);
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
    const defs = this.root.append('defs');
    defs
      .append('pattern')
      .attr('id', 'hatch')
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6)
      .attr('height', 6)
      .attr('patternTransform', 'rotate(45)')
      .append('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 6)
      .attr('stroke', SURFACE)
      .attr('stroke-opacity', 0.45)
      .attr('stroke-width', 2);
    this.root.append('rect').attr('class', 'surface').attr('width', opts.width).attr('height', opts.height).attr('fill', SURFACE);
    this.areas = this.root.append('g').attr('class', 'areas');
    this.outlines = this.root.append('g').attr('class', 'outlines');
    this.labels = this.root.append('g').attr('class', 'labels');

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
      out.push({ code, d: this.path(merged) ?? '', centroid: this.path.centroid(merged) });
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
            self.hoverCb?.({
              npa: e.poly.npa,
              codes: e.codes,
              pulses: pulses(e.display),
              original: originalOf(e.poly.npa, self.lineage),
            });
          })
          .on('mouseleave', () => self.hoverCb?.(null)),
      )
      .attr('class', (e) => e.kind)
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

    this.outlines
      .selectAll<SVGPathElement, Outline>('path')
      .data(this.outlinesFor(this.year), (o) => o.code)
      .join('path')
      .attr('class', 'outline')
      .attr('data-code', (o) => o.code)
      .attr('d', (o) => o.d)
      .attr('fill', 'none')
      .attr('stroke', SURFACE)
      .attr('stroke-width', 0.75)
      .attr('stroke-linejoin', 'round')
      .attr('pointer-events', 'none');

    this.renderLabels();
  }

  private renderLabels(): void {
    const outlines = this.outlinesFor(this.year);
    const shown = this.labelsOn
      ? this.labelCodes.map((code) => outlines.find((o) => o.code === code)).filter((o): o is Outline => Boolean(o))
      : [];
    this.labels
      .selectAll<SVGTextElement, Outline>('text')
      .data(shown, (o) => o.code)
      .join('text')
      .attr('class', 'label')
      .attr('x', (o) => o.centroid[0])
      .attr('y', (o) => o.centroid[1])
      .attr('fill', TEXT)
      .attr('stroke', SURFACE)
      .attr('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-family', '"JetBrains Mono", ui-monospace, monospace')
      .attr('font-size', 11)
      .attr('font-weight', 600)
      .attr('pointer-events', 'none')
      .text((o) => o.code);
  }
}
