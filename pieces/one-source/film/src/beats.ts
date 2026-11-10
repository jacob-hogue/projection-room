/**
 * The film's timeline in seconds. Every value is deterministic in t, so any frame renders alone.
 * Seven chapters: opening, problem, parts, architecture, pipeline, map, end card.
 */
export const FPS = 24;
export const FILM_SECONDS = 186;
/** Chapters cross-dissolve over this many seconds. */
export const DISSOLVE = 0.6;

export const TITLE = 'One Source';
export const RULE = 'Problem: a county keeps five copies of its parcel data. Solution: one shared database with a nightly update that every map reads from.';
/** The brief on the title card. */
export const BRIEF = [
  { label: 'Scenario', text: 'A county GIS team supports five offices that all work from the same parcel map.' },
  { label: 'Users', text: 'The assessor, planning, public works, dispatch, and the open data portal.' },
  { label: 'Problem', text: 'Each office keeps its own copy of the parcel data. There is no single source, and the copies disagree.' },
  { label: 'Assumptions', text: 'The county and its numbers are illustrative. Each office refreshes its copy by overwriting the whole layer. Three offices edit parcels; the rest only read.' },
  { label: 'Solution', text: 'One shared database as the source of record, with a nightly job that publishes read-only outputs for everyone else.' },
] as const;
export const BYLINE = 'A data film by Jacob Hogue';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';
export const SOURCE = 'Parcels: MassGIS Standardized Assessors’ Parcels, feature service read 2026-11-10 · Town boundaries: MassGIS';
export const STACK_LINE = 'PostGIS · GeoParquet · PMTiles · D3 · Remotion';
export const PIECE_LABEL = 'One Source · Projection Room 02';
export const END_LINE = 'One source of record, a nightly update, and every map reads the same parcels.';
/** The closing summary. */
export const SUMMARY = [
  { label: 'Problem', text: 'Five copies of one parcel map, and no single source.' },
  { label: 'Solution', text: 'One database, a nightly job, three read-only outputs.' },
  { label: 'Result', text: 'Every map, portal and application reads the same parcels.' },
] as const;

/** The one date window the film uses for "recent" edits, as YYYYMMDD. */
export const CUTOFF = 20230101;

/** Chapter starts. */
export const S = {
  opening: 0,
  problem: 8,
  parts: 32,
  architecture: 54,
  pipeline: 90,
  map: 140,
  end: 174,
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
  { from: 0, to: 8, text: '' },
  { from: 8, to: 20, text: 'The users first. The assessor values property. Planning reviews permits. Public works maintains roads and pipes. Dispatch routes emergency calls. The open data portal publishes it all. Every one of them needs the same parcels, and every one of them keeps a separate copy.' },
  { from: 20, to: 32, text: 'That is the core problem. Five copies, refreshed on five schedules, with no single source. Remember that the county and its numbers are illustrative. The key field has a different name in each office, the counts no longer match, and when two maps disagree nobody can say which one is right.' },
  { from: 32, to: 54, text: 'Break it down and there are three separate problems. One: no single source of record. Two: in this scenario, every update overwrites the whole layer to carry a few hundred changes. Three: the applications that only read parcels share a layer with the staff who edit them. Each one has a known fix, and together the fixes make up the solution.' },
  { from: 54, to: 72, text: 'The solution starts with one database as the source of record. Only the three offices that maintain parcels can write to it. It tracks who changed each record and when, and every parcel keeps a GlobalID for life.' },
  { from: 72, to: 90, text: 'A nightly job carries the changes out to three read-only outputs: a hosted feature layer, a GeoParquet file, and a PMTiles file. Every map, portal and application reads from those. The five copies go away.' },
  { from: 90, to: 102, text: 'Here is the job, step by step. It starts with a simple question: what changed since the last run? Edit tracking in the database answers it. On a typical night that is a few hundred records out of tens of thousands.' },
  { from: 102, to: 114, text: 'Before publishing anything, the job checks the changes. Do the row counts match? Are all the geometries valid? Does the schema still match what the applications expect? If any check fails, the job stops and records the reason in the log.' },
  { from: 114, to: 127, text: 'Once everything passes, the changes are published. The hosted feature layer receives individual edits instead of a full overwrite, so sync keeps working. The same changes are written to a new GeoParquet file and PMTiles file, each stamped with the run date.' },
  { from: 127, to: 140, text: 'From there, every application reads from one of those outputs. No department needs its own copy. The run log keeps track of what changed, how long the job took, and which files are current.' },
  { from: 140, to: 158, text: 'This is what the solution looks like at state scale. MassGIS already runs one shared parcel layer for all 351 cities and towns, 2.56 million parcels, each with the date it was last edited. Nearly four out of five have not been updated since before 2015. Towns with edits since 2023 show in green.' },
  { from: 158, to: 174, text: 'Zoom into Westborough and the same edit history is on every parcel: 7,164 parcels, edits from 2012 through 2026, and 730 of them since the start of 2023. One source of record, and every map reads the same data.' },
  { from: 174, to: FILM_SECONDS, text: '' },
];

export function captionAt(t: number): Caption | undefined {
  return CAPTIONS.find((c) => t >= c.from && t < c.to);
}
