/**
 * The film's timeline in seconds. Every value here is deterministic in t, so a frame can be
 * rendered on its own. Nine shots; the year run is three events (1948, 1992, 2007) and 2025.
 */
export const FPS = 24;
export const FILM_SECONDS = 151;
export const LOOP_FROM = 86;
export const LOOP_SECONDS = 7;

/** Frame layout, in pixels of the 1920 by 1080 picture. */
export const MAP = { left: 80, top: 250, width: 1300, height: 776 };
export const RAIL = { left: 1420, top: 250, width: 420, height: 776 };
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
  opening: 0,
  dialing: 7,
  newYork: 17,
  cities: 31,
  contrast: 47,
  middle: 63,
  changes: 80,
  present: 115,
  conclusion: 128,
  end: 145,
};

export const CAPTIONS: Caption[] = [
  { from: S.opening, to: S.dialing, text: 'Before telephone numbers became something we typed, they were something we physically dialed. And every digit took time.' },
  { from: S.dialing, to: S.newYork, text: 'A rotary telephone sent electrical pulses as the dial returned to its starting position. Each number produced that many pulses. One sent one. Nine sent nine. Zero sent ten.' },
  { from: S.newYork, to: S.cities, text: 'When AT&T designed the North American Numbering Plan in 1947, it assigned area codes with this mechanical reality in mind. New York received 212. Add the digits together, and the entire code took just five pulses to dial.' },
  { from: S.cities, to: S.contrast, text: "Other major telephone markets received relatively short codes, too. Los Angeles got 213, Chicago got 312, and Detroit got 313. These weren't arbitrary combinations. They were part of a numbering system designed for a network still built around rotary dialing." },
  { from: S.contrast, to: S.middle, text: "But not every place got a short code. Across the original map, dialing costs varied considerably. South Dakota's 605 required 21 pulses. North Carolina's 704 required the same number, despite serving a much larger population." },
  { from: S.middle, to: S.changes, text: 'There was another pattern hiding in the numbers. In the original system, a zero in the middle generally indicated a state served by one area code. A one indicated a state divided among multiple area codes. The number itself carried information about the geography it served.' },
  { from: S.changes, to: S.present, text: 'As telephone use expanded, those original boundaries began to change. New area codes were created by splitting existing territories, giving different regions their own numbers. Later, overlays offered another solution: a new code could be added to an existing territory without changing its geographic boundaries. The last geographic split in this sequence came in 2007.' },
  { from: S.present, to: S.conclusion, text: "By 2025, the map had grown to 367 area codes across 237 territories. Some places now have several codes serving the same geographic area. Houston's original 713 territory, for example, had five associated area codes." },
  { from: S.conclusion, to: S.end, text: 'The original codes reveal a numbering system shaped by the technology of its time. Shorter codes meant fewer dial pulses, especially valuable in a busy telephone network. But exactly how much that consideration determined each assignment remains a question of historical interpretation.' },
  { from: S.end, to: FILM_SECONDS, text: '' },
];

/** The year run: hold 1947, step to 1948, run to 1992, hold, run to 2007, hold, run to 2025. */
export const RUN = {
  split1948: 82.5,
  runTo1992: 88.5,
  hold1992: 93,
  runTo2007: 99,
  hold2007: 102.5,
  runTo2025: 108.5,
  done: 112,
};

/** Year at time t as a continuous value: the map blends between the two years around it. */
export function yearAt(t: number): number {
  if (t < RUN.split1948) return 1947;
  if (t < RUN.runTo1992) return 1947 + easeInOut(seg(t, RUN.split1948, RUN.split1948 + EASE.reveal));
  if (t < RUN.hold1992) return 1948 + easeInOut(seg(t, RUN.runTo1992, RUN.hold1992)) * (1992 - 1948);
  if (t < RUN.runTo2007) return 1992;
  if (t < RUN.hold2007) return 1992 + easeInOut(seg(t, RUN.runTo2007, RUN.hold2007)) * (2007 - 1992);
  if (t < RUN.runTo2025) return 2007;
  if (t < RUN.done) return 2007 + easeInOut(seg(t, RUN.runTo2025, RUN.done)) * (2025 - 2007);
  return 2025;
}

/** The film's motion vocabulary: three durations in seconds and two curves. Every move uses one of each. */
export const EASE = {
  /** Something arrives: rail text, a label, an inset. */
  enter: 0.4,
  /** A state changes: a fill, a spotlight, a mode. */
  state: 0.8,
  /** Something is revealed or redrawn: a boundary, the color scheme, a spotlight leaving. */
  reveal: 1.2,
  out: (p: number): number => 1 - Math.pow(1 - clamp(p), 3),
  inOut: (p: number): number => easeInOut(clamp(p)),
};

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
