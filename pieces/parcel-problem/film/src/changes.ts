/** Pure helpers over the parcel rows and the pipeline's stats file. */

export interface ParcelRow {
  loc: string;
  edit: number | null;
}

export interface ChangeRow {
  loc: string;
  edit: number;
  kind: 'changed';
}

/** The shape of pieces/parcel-problem/data/stats.json. */
export interface Stats {
  run: string;
  towns: number;
  parcels: number;
  bands: Record<string, number>;
  townsBy: { fresh: Record<string, number> };
  town: {
    id: number;
    name: string;
    n: number;
    first: number;
    last: number;
    years: Record<string, number>;
    latest: { date: number; count: number };
    /** Parcels with an edit date on or after the film's CUTOFF (2023-01-01). */
    since2023: number;
    /** The latest edit date with a real batch of records, and the night after it. */
    batch: { date: number; count: number; run: string };
    sample: { loc: string; edit: number }[];
  };
}

/** Rows carrying the newest edit date, sorted by loc, at most n of them. */
export function latestRows(parcels: ParcelRow[], n = 7): ChangeRow[] {
  const dated = parcels.filter((p): p is { loc: string; edit: number } => p.edit !== null && p.edit !== undefined);
  if (dated.length === 0) return [];
  const latest = Math.max(...dated.map((p) => p.edit));
  return dated
    .filter((p) => p.edit === latest)
    .sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0))
    .slice(0, n)
    .map((p) => ({ loc: p.loc, edit: p.edit, kind: 'changed' as const }));
}

export function countOnOrAfter(parcels: ParcelRow[], yyyymmdd: number): number {
  return parcels.filter((p) => p.edit !== null && p.edit !== undefined && p.edit >= yyyymmdd).length;
}

/** 20260526 to "2026-05-26". */
export function formatDate(yyyymmdd: number): string {
  const s = String(yyyymmdd).padStart(8, '0');
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** A share as a percentage with one decimal: share(618, 7164) is "8.6%". */
export function share(part: number, whole: number): string {
  if (whole === 0) return '0.0%';
  return `${((100 * part) / whole).toFixed(1)}%`;
}
