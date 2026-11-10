/**
 * The film's timeline in seconds. Every value is deterministic in t, so any frame renders alone.
 * Seven chapters: opening, problem, parts, architecture, pipeline, map, end card.
 */
export const FPS = 24;
export const FILM_SECONDS = 186;
/** Chapters cross-dissolve over this many seconds. */
export const DISSOLVE = 0.6;

export const TITLE = 'One Source';
export const RULE = 'A county keeps five copies of its parcel map. One database and a nightly update bring them together.';
export const BYLINE = 'A data film by Jacob Hogue';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';
export const SOURCE = 'Parcels: MassGIS Standardized Assessors’ Parcels, feature service read 2026-11-10 · Town boundaries: MassGIS';
export const STACK_LINE = 'PostGIS · GeoParquet · PMTiles · D3 · Remotion';
export const PIECE_LABEL = 'One Source · Projection Room 02';
export const END_LINE = 'When there’s one source of record, every map reads the same parcels.';

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
  { from: 0, to: 8, text: 'A county has five different copies of its parcel map. Here’s how one database and a nightly update can bring them all together.' },
  { from: 8, to: 20, text: 'Imagine a county with about 180,000 people. It’s a fictional example, but the setup should look familiar to just about any GIS team. The assessor, planning office, public works, dispatch, and open data portal all maintain their own copy of the same parcels.' },
  { from: 20, to: 32, text: 'Over time, those copies start to drift. The parcel ID field has a different name in each office. The counts don’t match. And when two maps disagree, there’s no clear way to know which one is right.' },
  { from: 32, to: 54, text: 'There are really three problems here. First, there’s no single authoritative copy. Second, every update replaces the entire layer just to account for a few hundred changes. And third, the applications that only need to read the data share a layer with the staff who edit it. Each problem has a pretty straightforward solution.' },
  { from: 54, to: 72, text: 'It starts with one database that holds the official parcel data. Only the offices responsible for maintaining it can make changes. The database tracks who edited each record and when, and every parcel has a GlobalID that stays with it.' },
  { from: 72, to: 90, text: 'Every night, a job picks up the records that have changed, checks them, and publishes three updated outputs: a hosted feature layer, a GeoParquet file, and a PMTiles file. Instead of maintaining separate copies, every web map, portal, and department application reads from these shared outputs.' },
  { from: 90, to: 102, text: 'The job starts with a simple question: what changed since the last run? Edit tracking in the database gives us that answer. On a typical night, that’s just a few hundred records out of tens of thousands.' },
  { from: 102, to: 114, text: 'Before publishing anything, the job checks the changes. Do the row counts match? Are all the geometries valid? Does the schema still match what the applications expect? If any check fails, the job stops and records the reason in the log.' },
  { from: 114, to: 127, text: 'Once everything passes, the changes are published. The hosted feature layer receives individual edits instead of a full overwrite, so sync keeps working. The same changes are also written to a new GeoParquet file and PMTiles file, each stamped with the run date.' },
  { from: 127, to: 140, text: 'From there, every application reads from one of those outputs. No department needs to maintain its own copy. The run log keeps track of what changed, how long the job took, and which files are up to date.' },
  { from: 140, to: 158, text: 'Massachusetts already does something similar at the state level. MassGIS brings together parcels from all 351 cities and towns in one standardized layer, covering more than 2.56 million parcels. Each parcel includes the date it was last edited. Nearly four out of five haven’t been updated since before 2015. On this map, towns with parcel edits since 2023 show up in green.' },
  { from: 158, to: 174, text: 'Zoom into Westborough, and you can see that same edit history at the parcel level. There are 7,164 parcels, with records dating from 2012 through 2026. Of those, 730 have been updated since the start of 2023. With one shared source of record, every map is working from the same data.' },
  { from: 174, to: FILM_SECONDS, text: '' },
];

export function captionAt(t: number): Caption | undefined {
  return CAPTIONS.find((c) => t >= c.from && t < c.to);
}
