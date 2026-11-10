/**
 * The map chapter's stage: the 351 towns tinted by parcel freshness, a camera that flies into
 * one town, and that town's parcels tinted by last-edit year. Everything is set per frame.
 */
import { geoIdentity, geoPath, select, type GeoPermissibleObjects, type Selection } from 'd3';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { C, RAMP } from './theme';

export interface TownProps {
  id: number;
  name: string;
  n: number;
  fresh: number | null;
  last: number | null;
}

export interface ParcelProps {
  loc: string;
  year: number | null;
  edit: number | null;
}

/** Share of parcels edited since 2023, on five steps: under 2%, 2 to 5%, 5 to 20%, 20 to 50%, 50% and over. */
export const FRESH_STEPS = [0.02, 0.05, 0.2, 0.5] as const;
export const FRESH_LABELS = ['under 2%', '2 to 5%', '5 to 20%', '20 to 50%', '50% and over'] as const;
/** Last-edit year on the same five steps as the pipeline's bands. */
export const YEAR_STEPS = [2015, 2020, 2023, 2025] as const;
export const YEAR_LABELS = ['before 2015', '2015 to 2019', '2020 to 2022', '2023 to 2024', '2025 on'] as const;

const step = (v: number, steps: readonly number[]): number => steps.filter((s) => v >= s).length;

export function freshColor(fresh: number | null): string {
  if (fresh === null || fresh === undefined || Number.isNaN(fresh)) return C.raised;
  return RAMP[step(fresh, FRESH_STEPS)];
}

export function yearColor(year: number | null): string {
  if (year === null || year === undefined) return C.raised;
  return RAMP[step(year, YEAR_STEPS)];
}

/** Indices sorted so that nulls come first, then ascending values; stable within ties. */
export function revealOrder(values: (number | null)[]): number[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return -1;
      if (b.v === null) return 1;
      return a.v - b.v || a.i - b.i;
    })
    .map((x) => x.i);
}

/** Opacity of item at rank `rank` of `n` when the reveal has reached `p`, with a soft edge. */
export function revealAlpha(rank: number, n: number, p: number, edge = 0.06): number {
  const head = p * (1 + edge) * n;
  return Math.min(1, Math.max(0, (head - rank) / (edge * n)));
}

export interface StageOptions {
  width: number;
  height: number;
  /** Share of the frame the zoomed town fills. */
  fill?: number;
}

type TownFeature = Feature<Geometry, TownProps>;
type ParcelFeature = Feature<Geometry, ParcelProps>;

export class ParcelStage {
  readonly towns: TownFeature[];
  readonly parcels: ParcelFeature[];
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly view: Selection<SVGGElement, unknown, null, undefined>;
  private readonly townPaths: Selection<SVGPathElement, TownFeature, SVGGElement, unknown>;
  private readonly parcelPaths: Selection<SVGPathElement, ParcelFeature, SVGGElement, unknown>;
  private readonly path: ReturnType<typeof geoPath>;
  private readonly townOrder: number[];
  private readonly parcelOrder: number[];
  private readonly townRank: number[];
  private readonly parcelRank: number[];
  private readonly w: number;
  private readonly h: number;
  private readonly zoom: { scale: number; cx: number; cy: number };
  private readonly centroids = new Map<number, [number, number]>();
  private camera = 0;

  constructor(svg: SVGSVGElement, towns: Topology, parcels: Topology, opts: StageOptions) {
    this.w = opts.width;
    this.h = opts.height;
    const townsFC = feature(towns, towns.objects.towns) as unknown as FeatureCollection<Geometry, TownProps>;
    const parcelsFC = feature(parcels, parcels.objects.parcels) as unknown as FeatureCollection<Geometry, ParcelProps>;
    this.towns = townsFC.features;
    this.parcels = parcelsFC.features;

    const projection = geoIdentity().reflectY(true).fitSize([this.w, this.h], townsFC as GeoPermissibleObjects);
    this.path = geoPath(projection);

    this.svg = select(svg);
    this.svg.selectAll('*').remove();
    this.view = this.svg.append('g').attr('class', 'view');
    const gTowns = this.view.append('g').attr('class', 'towns');
    const gParcels = this.view.append('g').attr('class', 'parcels');
    const gOutline = this.view.append('g').attr('class', 'outline');

    this.townPaths = gTowns
      .selectAll<SVGPathElement, TownFeature>('path')
      .data(this.towns)
      .join('path')
      .attr('d', (d) => this.path(d as GeoPermissibleObjects) ?? '')
      .attr('fill', (d) => freshColor(d.properties.fresh))
      .attr('stroke', C.ground)
      .attr('stroke-width', 0.8)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0);

    this.parcelPaths = gParcels
      .selectAll<SVGPathElement, ParcelFeature>('path')
      .data(this.parcels)
      .join('path')
      .attr('d', (d) => this.path(d as GeoPermissibleObjects) ?? '')
      .attr('fill', (d) => yearColor(d.properties.year))
      .attr('stroke', C.ground)
      .attr('stroke-width', 0.5)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0);

    gOutline
      .append('path')
      .attr('class', 'town-outline')
      .attr('fill', 'none')
      .attr('stroke', C.text)
      .attr('stroke-width', 1.5)
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('opacity', 0);

    for (const t of this.towns) this.centroids.set(t.properties.id, this.path.centroid(t as GeoPermissibleObjects) as [number, number]);

    this.townOrder = revealOrder(this.towns.map((t) => t.properties.fresh));
    this.parcelOrder = revealOrder(this.parcels.map((p) => p.properties.year));
    this.townRank = rankOf(this.townOrder);
    this.parcelRank = rankOf(this.parcelOrder);

    // The zoomed view: the parcels' bounds filling `fill` of the frame.
    const [[x0, y0], [x1, y1]] = this.path.bounds(parcelsFC as GeoPermissibleObjects);
    const fill = opts.fill ?? 0.8;
    const scale = fill * Math.min(this.w / (x1 - x0), this.h / (y1 - y0));
    this.zoom = { scale, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    this.cameraAt(0);
  }

  /** Towns reveal in order of freshness, lowest first, as `p` runs 0 to 1. */
  townFills(p: number): void {
    const n = this.towns.length;
    this.townPaths.attr('opacity', (_d, i) => revealAlpha(this.townRank[i], n, p));
  }

  /** Parcels reveal in order of last-edit year, oldest first. */
  parcelFills(p: number): void {
    const n = this.parcels.length;
    this.parcelPaths.attr('opacity', (_d, i) => revealAlpha(this.parcelRank[i], n, p));
  }

  /** 0 is the statewide view, 1 the town filling the frame; the caller eases k. */
  cameraAt(k: number): void {
    this.camera = k;
    const { scale, tx, ty } = this.transform(k);
    this.view.attr('transform', `translate(${tx},${ty}) scale(${scale})`);
  }

  /** Fade the town fills toward the ground so the parcels read on their own; k is 0 to 1. */
  townDim(k: number): void {
    this.view.select<SVGGElement>('g.towns').attr('opacity', 1 - 0.82 * k);
  }

  /** Outline the town with `id` at `alpha`. */
  setTownOutline(id: number, alpha: number): void {
    const t = this.towns.find((f) => f.properties.id === id);
    this.view
      .select<SVGPathElement>('path.town-outline')
      .attr('d', t ? this.path(t as GeoPermissibleObjects) ?? '' : '')
      .attr('opacity', alpha);
  }

  /** Screen position of a town's centroid under the current camera. */
  anchor(id: number): { x: number; y: number } | null {
    const c = this.centroids.get(id);
    if (!c) return null;
    const { scale, tx, ty } = this.transform(this.camera);
    return { x: tx + scale * c[0], y: ty + scale * c[1] };
  }

  private transform(k: number): { scale: number; tx: number; ty: number } {
    const scale = Math.exp(Math.log(1) * (1 - k) + Math.log(this.zoom.scale) * k);
    const cx = (this.w / 2) * (1 - k) + this.zoom.cx * k;
    const cy = (this.h / 2) * (1 - k) + this.zoom.cy * k;
    return { scale, tx: this.w / 2 - scale * cx, ty: this.h / 2 - scale * cy };
  }
}

/** rank[i] = position of item i in `order`. */
function rankOf(order: number[]): number[] {
  const rank = new Array<number>(order.length);
  order.forEach((idx, pos) => {
    rank[idx] = pos;
  });
  return rank;
}
