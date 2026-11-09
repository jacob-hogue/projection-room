/**
 * The film's timeline in seconds. Every value here is deterministic in t, so a frame can be
 * rendered on its own. Nine shots; the year run is three events (1948, 1992, 2007) and 2025.
 */
export const FPS = 30;
export const FILM_SECONDS = 76;
export const LOOP_FROM = 43;
export const LOOP_SECONDS = 7;

/** Frame layout, in pixels of the 1920 by 1080 picture. */
export const MAP = { left: 80, top: 200, width: 1300, height: 820 };
export const RAIL = { left: 1420, top: 200, width: 420, height: 820 };
export const INSET = { width: 420, height: 290 };

export const TITLE = 'The dial-pulse map';
export const SUBTITLE = 'A telephone network, measured in clicks.';
export const BYLINE = 'A data film by Jacob Hogue';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';
export const SOURCE = 'Area code boundaries: UCLA Geoportal, 2015 · Code history: NANPA and Wikipedia · 1950 population: Census Bureau';

export interface Caption {
  from: number;
  to: number;
  text: string;
}

/** Shot boundaries. */
export const S = {
  dial: 0,
  newYork: 6,
  cities: 12,
  original: 19,
  exception: 27,
  middle: 33,
  changes: 39,
  present: 58.5,
  explanation: 66,
  end: 71,
};

export const CAPTIONS: Caption[] = [
  { from: S.dial, to: S.newYork, text: 'A rotary dial sent electrical pulses as it spun back. Zero sent ten.' },
  { from: S.newYork, to: S.cities, text: 'In 1947, New York got 212. It took just five clicks to dial.' },
  { from: S.cities, to: S.original, text: 'Los Angeles and Chicago took six clicks. Detroit took seven.' },
  { from: S.original, to: S.exception, text: 'Across the United States, 77 area codes ranged from five clicks to 21.' },
  { from: S.exception, to: S.middle, text: 'South Dakota took 21 clicks. So did North Carolina, with 4.1 million people.' },
  { from: S.middle, to: S.changes, text: 'A zero in the middle meant one code for the whole state. A one meant it was divided.' },
  { from: S.changes, to: S.present, text: 'New territories kept appearing. Then overlays began adding codes without moving the boundaries. The last split came in 2007.' },
  { from: S.present, to: S.explanation, text: "By 2025, 367 codes covered 237 territories. Houston's 713 territory carried five." },
  { from: S.explanation, to: S.end, text: 'The usual explanation is that shorter codes saved time in busy places. The pattern is clear. The reason is disputed.' },
  { from: S.end, to: FILM_SECONDS, text: '' },
];

/** The year run: hold 1947, step to 1948, run to 1992, hold, run to 2007, hold, run to 2025. */
export const RUN = {
  split1948: 41.5,
  runTo1992: 43.5,
  hold1992: 48,
  runTo2007: 51,
  hold2007: 54,
  runTo2025: 56,
  done: 58.5,
};

export function yearAt(t: number): number {
  if (t < RUN.split1948) return 1947;
  if (t < RUN.runTo1992) return 1948;
  if (t < RUN.hold1992) return Math.round(1948 + easeInOut(seg(t, RUN.runTo1992, RUN.hold1992)) * (1992 - 1948));
  if (t < RUN.runTo2007) return 1992;
  if (t < RUN.hold2007) return Math.round(1992 + easeInOut(seg(t, RUN.runTo2007, RUN.hold2007)) * (2007 - 1992));
  if (t < RUN.runTo2025) return 2007;
  if (t < RUN.done) return Math.round(2007 + easeInOut(seg(t, RUN.runTo2025, RUN.done)) * (2025 - 2007));
  return 2025;
}

export function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Progress of a segment [a, b] at time t. */
export function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a));
}

export function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
