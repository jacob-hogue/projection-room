/**
 * The film's timeline in seconds. Every value is deterministic in t, so any frame renders alone.
 * Seven chapters: opening, problem, parts, architecture, pipeline, map, end card.
 */
export const FPS = 24;
export const FILM_SECONDS = 186;
/** Chapters cross-dissolve over this many seconds. */
export const DISSOLVE = 0.6;

export const TITLE = 'One Source';
export const RULE = 'A county keeps five copies of its parcel map. One database and a nightly job replace all of them.';
export const BYLINE = 'A data film by Jacob Hogue';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';
export const SOURCE = 'Parcels: MassGIS Standardized Assessors’ Parcels, feature service read 2026-11-10 · Town boundaries: MassGIS';
export const STACK_LINE = 'PostGIS · GeoParquet · PMTiles · D3 · Remotion';
export const PIECE_LABEL = 'One Source · Projection Room 02';

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
  { from: 0, to: 8, text: 'A county keeps five copies of its parcel map. This is the story of how one database and a nightly job replace all of them.' },
  { from: 8, to: 20, text: 'Picture a county of about 180,000 people. It is a composite, but every GIS team will recognise it. The assessor, the planning office, public works, dispatch and the open data portal each keep their own copy of the same parcels.' },
  { from: 20, to: 32, text: 'Over the years the copies have drifted apart. The key field has a different name in every office, the parcel counts no longer agree, and when two maps disagree there is no agreed way to say which one is correct.' },
  { from: 32, to: 54, text: 'Pulled apart, the problem turns out to be three smaller ones. Nobody owns the master copy. Every refresh rewrites the whole layer to carry a few hundred changes. And the applications that only need to read sit on the same layer that staff edit all day. Each of the three has a fix that GIS teams already know how to run.' },
  { from: 54, to: 72, text: 'The fix starts with one database that holds the official parcels, and only the offices that maintain them are allowed to write to it. It tracks who edited each row and when, and every row carries a global identifier that never changes.' },
  { from: 72, to: 90, text: 'Each night a job finds the rows that changed, checks them, and publishes them in three read-only forms: a hosted feature layer updated with edits rather than overwritten, a GeoParquet file, and a PMTiles file. Every web map, portal and department view reads from those outputs, so the departmental copies can be retired.' },
  { from: 90, to: 102, text: 'The job begins with a single question: which rows have changed since it last ran? The answer comes from the edit tracking in the database, and on a typical night it is a few hundred rows out of tens of thousands.' },
  { from: 102, to: 114, text: 'Before anything is published, the changed rows are checked. Do the counts add up? Is every polygon valid? Does the schema still match what the readers expect? A failed check stops the run and writes the reason to the log.' },
  { from: 114, to: 127, text: 'Publishing applies the changes as edits to the hosted layer, so nothing is overwritten and sync keeps working. The same rows are written into a new GeoParquet file and a new PMTiles file, each with the date in its name.' },
  { from: 127, to: 140, text: 'Serving is the easy part. Every reader points at one of the three outputs, and none of them needs a copy. When the job finishes, the run log records what moved, how long it took, and which files are current.' },
  { from: 140, to: 158, text: 'Massachusetts already runs this idea at the scale of a state. MassGIS gathers the parcels of all 351 cities and towns into one standardised layer, 2.56 million parcels, and every parcel carries the date it was last edited. Here each town is tinted by how fresh its parcel data is.' },
  { from: 158, to: 174, text: 'Zoom into one town and the same date is on every parcel. In Westborough, 7,164 parcels carry edits from 2012 to 2026, and the newest ones glow green. When there is one source of record, every map reads the same parcels.' },
  { from: 174, to: FILM_SECONDS, text: '' },
];

export function captionAt(t: number): Caption | undefined {
  return CAPTIONS.find((c) => t >= c.from && t < c.to);
}
