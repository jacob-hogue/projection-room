/**
 * The film's timeline in seconds. Every value is deterministic in t, so any frame renders alone.
 * Seven chapters: opening, problem, parts, architecture, pipeline, map, end card.
 */
export const FPS = 24;
export const FILM_SECONDS = 222;
/** Chapters cross-dissolve over this many seconds. */
export const DISSOLVE = 0.6;

export const TITLE = 'One Source';
export const RULE = 'Problem: a county keeps five copies of its parcel data. Solution: one shared database with a nightly update that every map reads from.';
/** The brief on the title card. */
export const BRIEF = [
  { label: 'Scenario', text: 'Five county offices work from one parcel map.' },
  { label: 'Problem', text: 'Each office keeps its own copy. The copies disagree.' },
  { label: 'Solution', text: 'One database of record, one editing service, and a nightly job that publishes read-only outputs.' },
] as const;
/** Under the title: what the scenario assumes. */
export const BRIEF_NOTE = 'Illustrative county scenario \u00b7 ArcGIS Online \u00b7 ArcGIS Enterprise';
export const BYLINE = 'A data film by Jacob Hogue';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';
export const SOURCE = 'Parcels: MassGIS Standardized Assessors’ Parcels, feature service read 2026-11-10 · Town boundaries: MassGIS';
export const STACK_LINE = 'PostGIS · GeoParquet · PMTiles · D3 · Remotion';
export const PIECE_LABEL = 'One Source · Projection Room 02';
export const END_LINE = 'One source of record. Every map reads the same parcels.';
/** The closing summary. */
export const SUMMARY = [
  { label: 'Problem', text: 'Five copies, no single source.' },
  { label: 'Solution', text: 'One database, one editing service, a nightly job.' },
  { label: 'Result', text: 'Every map reads the same parcels.' },
] as const;

/** The one date window the film uses for "recent" edits, as YYYYMMDD. */
export const CUTOFF = 20230101;

/** Chapter starts. */
export const S = {
  opening: 0,
  problem: 16,
  parts: 46,
  architecture: 76,
  pipeline: 116,
  map: 170,
  end: 206,
} as const;

export const CHAPTERS = ['Problem', 'Parts', 'Architecture', 'Pipeline', 'Map'] as const;
const CHAPTER_STARTS = [S.problem, S.parts, S.architecture, S.pipeline, S.map];

/** Index into CHAPTERS; -1 during the opening, 5 on the end card. */
export function chapterAt(t: number): number {
  if (t >= S.end) return 5;
  let i = -1;
  for (let k = 0; k < CHAPTER_STARTS.length; k++) if (t >= CHAPTER_STARTS[k]) i = k;
  return i;
}

/** The second a chapter index starts at (-1 is the opening, 5 the end card). */
export function chapterStart(chapter: number): number {
  if (chapter < 0) return S.opening;
  if (chapter > 4) return S.end;
  return CHAPTER_STARTS[chapter];
}

export const clamp = (p: number): number => Math.min(1, Math.max(0, p));
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a));

const easeInOut = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Motion tokens: durations in seconds and the two curves the film uses. */
export const EASE = {
  enter: 0.4,
  state: 0.8,
  reveal: 1.2,
  out: (p: number): number => 1 - Math.pow(1 - clamp(p), 3),
  inOut: (p: number): number => easeInOut(clamp(p)),
} as const;

export interface Caption {
  from: number;
  to: number;
  text: string;
}

export const CAPTIONS: Caption[] = [
  { from: 0, to: 16, text: '' },
  { from: 16, to: 30, text: 'Five offices, five copies of the same parcel data. Each office maintains its own version.' },
  { from: 30, to: 46, text: 'Over time, the copies drift. Field names differ, counts stop matching, and nobody knows which map to trust.' },
  { from: 46, to: 76, text: 'There are three problems here, and each has a straightforward fix.' },
  { from: 76, to: 96, text: 'One database holds the official parcel data. Staff edit it through a single service, whether they\u2019re at their desks or out in the field.' },
  { from: 96, to: 116, text: 'Each night, a job picks up the changes and publishes three read-only outputs. Everyone else reads from those.' },
  { from: 116, to: 130, text: 'First, find what changed since the last run. The database\u2019s edit tracking tells us.' },
  { from: 130, to: 143, text: 'Next, validate the changes: row counts, geometry, and schema. If anything fails, the job stops.' },
  { from: 143, to: 156, text: 'Then publish. The hosted feature layer gets individual edits, not a full overwrite, so sync keeps working.' },
  { from: 156, to: 170, text: 'Finally, serve. Every application reads from one of the outputs. No department needs its own copy.' },
  { from: 170, to: 190, text: 'MassGIS brings together parcels from all 351 Massachusetts towns in one standardized layer. Towns with parcel edits since 2023 show up in green.' },
  { from: 190, to: 206, text: 'Here\u2019s Westborough, parcel by parcel. 730 of its 7,164 parcels have been edited since 2023.' },
  { from: 206, to: FILM_SECONDS, text: '' },
];

export function captionAt(t: number): Caption | undefined {
  return CAPTIONS.find((c) => t >= c.from && t < c.to);
}
