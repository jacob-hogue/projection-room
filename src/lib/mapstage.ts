/**
 * The D3 renderer for the dial-pulse map. Geometry arrives pre-projected (EPSG:5070) in a
 * TopoJSON, so the projection is an identity fit to the stage; changing the year only
 * recolors and redraws dissolved outlines, never re-projects.
 *
 * Layers, bottom to top, inside one `g.view` the camera moves: water, areas (with
 * hatches), territory outlines (dark casing under a light line), halos, the coast (soft glow
 * under a thin light edge), labels. The legend sits outside the view.
 *
 * Every state change takes a duration. Zero applies at once (also what reduced motion
 * gets); anything else tweens with d3 transitions.
 */
import { easeCubicInOut, geoIdentity, geoPath, select, type BaseType, type GeoPath, type GeoProjection, type Selection } from 'd3';
// selection.transition and selection.interrupt are added by d3-transition as a side effect;
// a bundler drops it from the d3 barrel unless it is imported for itself.
import 'd3-transition';
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

export interface RevealOptions {
  /** Milliseconds between one territory and the next. */
  step: number;
  /** Milliseconds each territory takes to fade in. */
  duration: number;
}

export const YEAR_MIN = 1947;
export const YEAR_MAX = 2025;
export const LABEL_COUNT = 5;
export const DIM_OPACITY = 0.22;
export const NEW_FLASH_MS = 900;
const MAX_ZOOM = 6;

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
/** Firefly stack for a focused territory: wide and faint under narrow and bright. */
const HALO_STACK: { width: number; opacity: number }[] = [
  { width: 10, opacity: 0.12 },
  { width: 5, opacity: 0.25 },
  { width: 2, opacity: 0.9 },
];

const EMBEDDED_STYLE = [
  `.mapstage{background:${SURFACE}}`,
  '.area{stroke-linejoin:round}',
  `.area.is-hover{stroke:${TEXT};stroke-width:1.2}`,
  `.area.is-new{stroke:${TEXT};stroke-width:1.4}`,
  '.hatch,.outline-casing,.outline,.coast,.halo,.label,.legend{pointer-events:none}',
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
  bounds: [[number, number], [number, number]];
}

type G = Selection<SVGGElement, unknown, null, undefined>;

export class MapStage {
  private readonly root: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly view: G;
  private readonly areas: G;
  private readonly casings: G;
  private readonly lines: G;
  private readonly halos: G;
  private readonly labels: G;
  private readonly legend: G;
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
  private blank = false;
  /** Display codes shown while blank (the opening beats bring cities in one at a time). */
  private shown = new Set<string>();
  private focused: Set<string> | null = null;
  private zoom = { k: 1, x: 0, y: 0 };
  private cameraTarget: string | undefined;
  private cameraFrom = { k: 1, cx: 0, cy: 0 };
  private lastDisplay = new Map<string, string>();
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
    this.view = this.root.append('g').attr('class', 'view');
    this.areas = this.view.append('g').attr('class', 'areas');
    const outlines = this.view.append('g').attr('class', 'outlines');
    this.casings = outlines.append('g').attr('class', 'outline-casings');
    this.lines = outlines.append('g').attr('class', 'outline-lines');
    this.halos = this.view.append('g').attr('class', 'halos');
    this.drawCoast(object);
    this.labels = this.view.append('g').attr('class', 'labels');
    this.legend = this.root.append('g').attr('class', 'legend');

    this.labelCodes = this.fastestOriginals();
    this.render(0);
  }

  // Public state changes. ------------------------------------------------------------------

  setYear(year: number, duration = 0): void {
    this.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    this.render(duration);
  }

  setMode(mode: Mode, duration = 0): void {
    this.mode = mode;
    this.render(duration);
  }

  setPalette(p: Palette, duration = 0): void {
    this.palette = p;
    this.render(duration);
  }

  setLabels(on: boolean): void {
    this.labelsOn = on;
    this.renderLabels();
  }

  setLegend(on: boolean): void {
    this.legendOn = on;
    this.renderLegend();
  }

  /** Hide the data layers (coast and water stay), or show them again. */
  setBlank(on: boolean, duration = 0): void {
    this.blank = on;
    this.shown.clear();
    this.root.attr('data-blank', String(on));
    const target = on ? 0 : 1;
    this.fade(this.areas.selectAll<SVGPathElement, Entry>('path'), (e) => (on ? 0 : this.opacityFor(e.display)), duration);
    this.fade(this.casings.selectAll('path'), () => target, duration);
    this.fade(this.lines.selectAll('path'), () => target, duration);
    this.fade(this.labels.selectAll('text'), () => target, duration);
  }

  /** While blank, bring the territories of the given display codes in, in that order. */
  show(codes: string[], opts: RevealOptions): Promise<void> {
    const rank = new Map(codes.map((c, i) => [c, i]));
    for (const c of codes) this.shown.add(c);
    const paths = this.areas
      .selectAll<SVGPathElement, Entry>('path')
      .filter((e) => rank.has(e.display));
    if (opts.duration === 0 && opts.step === 0) {
      paths.interrupt('fade').attr('opacity', (e) => this.opacityFor(e.display));
      return Promise.resolve();
    }
    paths
      .transition('fade')
      .delay((e) => (rank.get(e.display) ?? 0) * opts.step)
      .duration(opts.duration)
      .ease(easeCubicInOut)
      .attr('opacity', (e) => this.opacityFor(e.display));
    const total = (codes.length - 1) * opts.step + opts.duration;
    return new Promise((resolve) => setTimeout(resolve, total + 20));
  }

  /** From blank, bring territories in one after another in the given order (others last). */
  reveal(order: string[], opts: RevealOptions): Promise<void> {
    const rank = new Map(order.map((npa, i) => [npa, i]));
    const n = this.polys.length;
    const indexOf = (npa: string) => rank.get(npa) ?? order.length + this.polys.findIndex((p) => p.npa === npa);
    const paths = this.areas.selectAll<SVGPathElement, Entry>('path');
    paths.attr('data-reveal', (e) => indexOf(e.poly.npa));
    const total = (n - 1) * opts.step + opts.duration;
    const self = this;
    // Targets are computed as if already revealed; the data-blank attribute flips at the end.
    this.blank = false;
    this.shown.clear();
    if (opts.duration === 0 && opts.step === 0) {
      this.root.attr('data-blank', 'false');
      paths.attr('opacity', (e) => this.opacityFor(e.display));
      this.casings.selectAll('path').attr('opacity', 1);
      this.lines.selectAll('path').attr('opacity', 1);
      this.renderLabels();
      return Promise.resolve();
    }
    paths
      .transition('reveal')
      .delay((e) => indexOf(e.poly.npa) * opts.step)
      .duration(opts.duration)
      .ease(easeCubicInOut)
      .attr('opacity', (e) => this.opacityFor(e.display));
    this.casings.selectAll('path').transition('reveal').delay(total * 0.6).duration(opts.duration * 2).attr('opacity', 1);
    this.lines.selectAll('path').transition('reveal').delay(total * 0.6).duration(opts.duration * 2).attr('opacity', 1);
    return new Promise((resolve) => {
      setTimeout(() => {
        self.root.attr('data-blank', 'false');
        paths.interrupt('reveal').attr('opacity', (e) => self.opacityFor(e.display));
        self.casings.selectAll('path').interrupt('reveal').attr('opacity', 1);
        self.lines.selectAll('path').interrupt('reveal').attr('opacity', 1);
        self.renderLabels();
        resolve();
      }, total + 60);
    });
  }

  /** Dim everything except the given display codes and halo them; null clears. */
  focus(codes: string[] | null, duration = 0): void {
    this.focused = codes ? new Set(codes) : null;
    const paths = this.areas.selectAll<SVGPathElement, Entry>('path');
    this.fade(paths, (e) => this.opacityFor(e.display), duration);
    this.drawHalos(codes ?? [], 1, duration);
  }

  private drawHalos(codes: string[], strength: number, duration = 0): void {
    const wanted = new Set(codes);
    const outlines = this.outlinesFor(this.year).filter((o) => wanted.has(o.code));
    const fillOf = (code: string) => this.colorFor(code, this.classify(code));
    const rings = outlines.flatMap((o) => HALO_STACK.map((s, i) => ({ o, s, key: `${o.code}:${i}` })));
    const sel = this.halos
      .selectAll<SVGPathElement, { o: Outline; s: { width: number; opacity: number }; key: string }>('path')
      .data(rings, (r) => r.key);
    sel.exit().remove();
    const enter = sel
      .enter()
      .append('path')
      .attr('class', 'halo')
      .attr('fill', 'none')
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('stroke-opacity', 0);
    const all = enter
      .merge(sel)
      .attr('d', (r) => r.o.d)
      .attr('stroke', (r) => fillOf(r.o.code))
      .attr('stroke-width', (r) => r.s.width);
    if (duration > 0) all.transition('halo').duration(duration).ease(easeCubicInOut).attr('stroke-opacity', (r) => r.s.opacity * strength);
    else all.interrupt('halo').attr('stroke-opacity', (r) => r.s.opacity * strength);
  }

  /** Scale and centre (in stage units) that frame a display code's territory. */
  private centerFor(code: string): { k: number; cx: number; cy: number } {
    const outline = this.outlinesFor(this.year).find((o) => o.code === code);
    if (!outline) return { k: 1, cx: this.width / 2, cy: this.height / 2 };
    const [[x0, y0], [x1, y1]] = outline.bounds;
    const bw = Math.max(1, x1 - x0);
    const bh = Math.max(1, y1 - y0);
    const k = Math.min(MAX_ZOOM, 0.8 / Math.max(bw / this.width, bh / this.height));
    return { k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  private cameraCenter(): { k: number; cx: number; cy: number } {
    const { k, x, y } = this.zoom;
    return { k, cx: (this.width / 2 - x) / k, cy: (this.height / 2 - y) / k };
  }

  private applyCamera(zoom: { k: number; x: number; y: number }, duration: number): void {
    this.zoom = zoom;
    const transform = `translate(${zoom.x},${zoom.y}) scale(${zoom.k})`;
    if (duration > 0) this.view.transition('zoom').duration(duration).ease(easeCubicInOut).attr('transform', transform);
    else this.view.interrupt('zoom').attr('transform', transform);
    this.root.attr('data-zoom', zoom.k.toFixed(2));
    // Labels are sized for the whole map; let them go while zoomed in.
    this.fade(this.labels.selectAll('text'), () => (zoom.k > 1.3 ? 0 : 1), duration);
  }

  /** Move the camera to a display code's territory, or back to the whole map with null. */
  zoomTo(code: string | null, duration = 0): void {
    const c = code ? this.centerFor(code) : { k: 1, cx: this.width / 2, cy: this.height / 2 };
    this.cameraTarget = code ?? '';
    this.cameraFrom = c;
    this.applyCamera({ k: c.k, x: this.width / 2 - c.k * c.cx, y: this.height / 2 - c.k * c.cy }, duration);
  }

  // Frame-driven setters: deterministic for a given progress, used by the film and the stepper.

  /** Prepare every year's outlines in idle slices so later year changes do no geometry work. */
  async warm(): Promise<void> {
    for (let year = YEAR_MIN; year <= YEAR_MAX; year++) {
      if (!this.outlineCache.has(year)) this.outlinesFor(year);
      if ((year - YEAR_MIN) % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }
  }

  cachedYears(): number {
    return this.outlineCache.size;
  }

  /** Camera at progress t (0..1) from where it was toward a territory, or toward the whole map. */
  cameraAt(code: string | null, t: number): void {
    const key = code ?? '';
    if (this.cameraTarget !== key) {
      this.cameraTarget = key;
      this.cameraFrom = this.cameraCenter();
    }
    const to = code ? this.centerFor(code) : { k: 1, cx: this.width / 2, cy: this.height / 2 };
    const from = this.cameraFrom;
    const e = easeCubicInOut(Math.min(1, Math.max(0, t)));
    const k = from.k + (to.k - from.k) * e;
    const cx = from.cx + (to.cx - from.cx) * e;
    const cy = from.cy + (to.cy - from.cy) * e;
    this.applyCamera({ k, x: this.width / 2 - k * cx, y: this.height / 2 - k * cy }, 0);
  }

  /** From blank, territories appear in order as t runs 0 to 1; at 1 the stage is no longer blank. */
  revealAt(order: string[], t: number): void {
    const n = Math.max(1, this.polys.length);
    const rank = new Map(order.map((npa, i) => [npa, i]));
    const indexOf = (npa: string) => rank.get(npa) ?? order.length + this.polys.findIndex((p) => p.npa === npa);
    const span = n * 0.15;
    const p = Math.min(1, Math.max(0, t));
    const done = p >= 1;
    this.blank = !done;
    this.shown.clear();
    this.root.attr('data-blank', String(!done));
    this.areas
      .selectAll<SVGPathElement, Entry>('path')
      .interrupt('fade')
      .interrupt('reveal')
      .attr('opacity', (e) => {
        const own = Math.min(1, Math.max(0, (p * (n + span) - indexOf(e.poly.npa)) / span));
        return own * (done ? this.opacityFor(e.display) : this.focused && !this.focused.has(e.display) ? DIM_OPACITY : 1);
      });
    const lines = Math.min(1, Math.max(0, (p - 0.6) / 0.4));
    this.casings.selectAll('path').interrupt('reveal').attr('opacity', lines);
    this.lines.selectAll('path').interrupt('reveal').attr('opacity', lines);
    this.renderLabels();
  }

  /** Dim everything but the given display codes by progress t, haloing them in step; null undims. */
  dimAt(codes: string[] | null, t: number): void {
    const p = Math.min(1, Math.max(0, t));
    this.focused = codes && p > 0 ? new Set(codes) : null;
    const paths = this.areas.selectAll<SVGPathElement, Entry>('path').interrupt('fade');
    if (codes) {
      const set = new Set(codes);
      paths.attr('opacity', (e) => (this.blank && !this.shown.has(e.display) ? 0 : set.has(e.display) ? 1 : 1 - p * (1 - DIM_OPACITY)));
      this.drawHalos(codes, p);
    } else {
      paths.attr('opacity', (e) => (this.blank && !this.shown.has(e.display) ? 0 : DIM_OPACITY + p * (1 - DIM_OPACITY)));
      this.drawHalos([], 1);
    }
  }

  /** Land on a complete state at once: no transitions, no focus, no zoom, data layers shown. */
  settle(s: { year: number; mode: Mode; labels: boolean; blank?: boolean }): void {
    this.root.selectAll('*').interrupt('fade').interrupt('color').interrupt('reveal').interrupt('halo').interrupt('zoom');
    this.focused = null;
    this.drawHalos([], 1);
    this.cameraTarget = undefined;
    this.applyCamera({ k: 1, x: 0, y: 0 }, 0);
    this.mode = s.mode;
    this.labelsOn = s.labels;
    this.blank = s.blank ?? false;
    this.shown.clear();
    this.root.attr('data-blank', String(this.blank));
    this.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(s.year)));
    this.render(0);
    const target = this.blank ? 0 : 1;
    this.areas.selectAll<SVGPathElement, Entry>('path').attr('opacity', (e) => this.opacityFor(e.display));
    this.casings.selectAll('path').attr('opacity', target);
    this.lines.selectAll('path').attr('opacity', target);
    this.labels.selectAll('text').attr('opacity', target);
  }

  onHover(cb: (info: HoverInfo | null) => void): void {
    this.hoverCb = cb;
  }

  // Readbacks. ---------------------------------------------------------------------------

  state(): { year: number; mode: Mode; palette: string; zoom: number } {
    return { year: this.year, mode: this.mode, palette: this.palette.name, zoom: this.zoom.k };
  }

  /** Stage coordinates (after the camera) of a display code's label anchor this year. */
  anchor(code: string): { x: number; y: number } | null {
    const o = this.outlinesFor(this.year).find((o) => o.code === code);
    if (!o) return null;
    return { x: this.zoom.x + this.zoom.k * o.anchor[0], y: this.zoom.y + this.zoom.k * o.anchor[1] };
  }

  /** Every code a territory carries this year, display code first. */
  codesFor(npa: string): string[] {
    return polygonCodes(npa, this.year, this.lineage);
  }

  /** The display code a territory carries this year. */
  displayOf(npa: string): string {
    return displayCode(this.codesFor(npa), this.year, this.lineage);
  }

  /** Territory codes in the data, for ordering reveals. */
  territories(): string[] {
    return this.polys.map((p) => p.npa);
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

  // Internals. ---------------------------------------------------------------------------

  private fade<E extends BaseType, D>(sel: Selection<E, D, SVGGElement, unknown>, to: (d: D) => number, duration: number): void {
    if (duration > 0) sel.transition('fade').duration(duration).ease(easeCubicInOut).attr('opacity', (d) => to(d));
    else sel.interrupt('fade').attr('opacity', (d) => to(d));
  }

  private opacityFor(display: string): number {
    if (this.blank && !this.shown.has(display)) return 0;
    if (this.focused && !this.focused.has(display)) return DIM_OPACITY;
    return 1;
  }

  private drawCoast(object: GeometryCollection): void {
    // Exterior arcs only: arcs with the same polygon on both sides are the land edge.
    const d = this.path(mesh(this.topology, object, (a, b) => a === b)) ?? '';
    const g = this.view.append('g').attr('class', 'coast');
    g.append('path')
      .attr('class', 'coast coast-glow')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', TEXT)
      .attr('stroke-opacity', 0.12)
      .attr('stroke-width', COAST_GLOW_WIDTH)
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');
    g.append('path')
      .attr('class', 'coast coast-edge')
      .attr('d', d)
      .attr('fill', 'none')
      .attr('stroke', TEXT)
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', COAST_WIDTH)
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');
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
      out.push({ code, d: this.path(merged) ?? '', anchor: this.anchorFor(merged), bounds: this.path.bounds(merged) });
    }
    out.sort((a, b) => Number(a.code) - Number(b.code));
    this.outlineCache.set(year, out);
    return out;
  }

  private render(duration: number): void {
    this.root.attr('data-year', this.year).attr('data-mode', this.mode).attr('data-palette', this.palette.name);
    const self = this;
    const entries = this.entries();

    // Territories whose code changed since the last render flash for a moment.
    const changed = new Set<string>();
    for (const e of entries) {
      if (e.kind !== 'area') continue;
      const prev = this.lastDisplay.get(e.poly.npa);
      if (prev !== undefined && prev !== e.display) changed.add(e.poly.npa);
      this.lastDisplay.set(e.poly.npa, e.display);
    }

    const paths = this.areas
      .selectAll<SVGPathElement, Entry>('path')
      .data(entries, (e) => `${e.kind}:${e.poly.npa}`)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('d', (e) => e.poly.d)
            .attr('vector-effect', 'non-scaling-stroke')
            .attr('opacity', (e) => (e.kind === 'hatch' && duration > 0 ? 0 : this.opacityFor(e.display)))
            .attr('fill', (e) => (e.kind === 'area' ? e.fill : 'url(#hatch)'))
            .attr('stroke', (e) => (e.kind === 'area' ? e.fill : null))
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
        (update) => update,
        (exit) => (duration > 0 ? exit.transition('fade').duration(duration).attr('opacity', 0).remove() : exit.remove()),
      )
      .attr('class', function (e) {
        const keep: string[] = [e.kind];
        if (this.classList.contains('is-hover')) keep.push('is-hover');
        if (e.kind === 'area' && changed.has(e.poly.npa)) keep.push('is-new');
        return keep.join(' ');
      })
      .attr('data-npa', (e) => e.poly.npa)
      .attr('data-codes', (e) => e.codes.join(','))
      .attr('data-display', (e) => e.display)
      .attr('data-class', (e) => e.cls)
      .attr('stroke-width', (e) => (e.kind === 'area' ? AREA_SEAM : null))
      .attr('stroke-linejoin', (e) => (e.kind === 'area' ? 'round' : null))
      .attr('pointer-events', (e) => (e.kind === 'area' ? null : 'none'))
      .order();

    if (changed.size) {
      setTimeout(() => {
        this.areas.selectAll<SVGPathElement, Entry>('path.is-new').classed('is-new', false);
      }, NEW_FLASH_MS);
    }

    // Color: stroking each area in its own fill closes the hairline seams between neighbours.
    const areasOnly = paths.filter((e) => e.kind === 'area');
    const hatches = paths.filter((e) => e.kind === 'hatch');
    if (duration > 0) {
      areasOnly
        .transition('color')
        .duration(duration)
        .ease(easeCubicInOut)
        .attr('fill', (e) => e.fill)
        .attr('stroke', (e) => e.fill)
        .on('end', function (e) {
          select(this).attr('fill', e.fill).attr('stroke', e.fill);
        });
      hatches.transition('fade').duration(duration).attr('opacity', (e) => this.opacityFor(e.display));
    } else {
      areasOnly.interrupt('color').attr('fill', (e) => e.fill).attr('stroke', (e) => e.fill);
      hatches.attr('opacity', (e) => this.opacityFor(e.display));
    }

    const outlines = this.outlinesFor(this.year);
    const drawOutlines = (g: G, cls: string, stroke: string, opacity: number, width: number) => {
      const sel = g.selectAll<SVGPathElement, Outline>('path').data(outlines, (o) => o.code);
      const enter = sel
        .enter()
        .append('path')
        .attr('class', cls)
        .attr('fill', 'none')
        .attr('stroke', stroke)
        .attr('stroke-opacity', opacity)
        .attr('stroke-width', width)
        .attr('stroke-linejoin', 'round')
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('opacity', duration > 0 || this.blank ? 0 : 1);
      if (duration > 0) {
        sel.exit().transition('fade').duration(duration).attr('opacity', 0).remove();
        if (!this.blank) enter.transition('fade').duration(duration).attr('opacity', 1);
      } else {
        sel.exit().remove();
      }
      enter.merge(sel).attr('data-code', (o) => o.code).attr('d', (o) => o.d);
    };
    drawOutlines(this.casings, 'outline-casing', SURFACE, 0.9, CASING_WIDTH);
    drawOutlines(this.lines, 'outline', TEXT, 0.35, LINE_WIDTH);

    if (this.focused) this.focus([...this.focused], duration);
    this.renderLabels();
    this.renderLegend();
  }

  private renderLabels(): void {
    const outlines = this.outlinesFor(this.year);
    const shown = this.labelsOn && !this.blank
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
      .attr('text-anchor', 'middle')
      .attr('opacity', this.zoom.k > 1.3 ? 0 : 1);
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
