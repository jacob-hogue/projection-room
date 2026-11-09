/**
 * The film's timeline in seconds. Every value here is deterministic in t, so a frame can be
 * rendered on its own. The page's story steps follow the same order.
 */
export const FPS = 30;
export const FILM_SECONDS = 56;
export const LOOP_FROM = 33;
export const LOOP_SECONDS = 7;

export const STAGE_W = 1480;
export const STAGE_H = 900;

export interface Caption {
  from: number;
  to: number;
  text: string;
}

export const TITLE = 'The dial-pulse map';
export const SOURCE = 'Area code polygons: UCLA Geoportal, 2015 · Lineage: NANPA and Wikipedia · 1950 population: Census Bureau';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';

export const CAPTIONS: Caption[] = [
  { from: 0, to: 4.5, text: 'A rotary dial sent one click per digit, ten clicks a second. 212 took five.' },
  { from: 4.5, to: 9.5, text: 'In 1947 New York got 212, the fastest area code on the plan.' },
  { from: 9.5, to: 15, text: 'Chicago 312 and Los Angeles 213 took six clicks. Detroit 313 took seven.' },
  { from: 15, to: 22, text: 'All 77 United States codes, filling in from the fastest to the slowest.' },
  { from: 22, to: 27.5, text: 'South Dakota, South Carolina and North Carolina took 21 clicks, four times New York.' },
  { from: 27.5, to: 32.5, text: 'A 0 in the middle meant one code for the whole state. A 1 meant the state was split.' },
  { from: 32.5, to: 46, text: 'Splits, then overlays after 1992: 77 codes in 1947, 367 in 2025.' },
  { from: 46, to: 51.5, text: "Houston's 713 territory now carries five codes. 212 is still Manhattan." },
  { from: 51.5, to: FILM_SECONDS, text: '' },
];

export interface CalloutBeat {
  from: number;
  to: number;
  code: string;
  title: string;
  value: string;
  dx: number;
  dy: number;
}

export const CALLOUTS: CalloutBeat[] = [
  { from: 6.4, to: 9.5, code: '212', title: 'New York', value: '212 · 5 clicks', dx: 110, dy: -80 },
  { from: 10.8, to: 15, code: '312', title: 'Chicago', value: '312 · 6 clicks', dx: -60, dy: -90 },
  { from: 11.5, to: 15, code: '213', title: 'Los Angeles', value: '213 · 6 clicks', dx: 90, dy: 80 },
  { from: 12.2, to: 15, code: '313', title: 'Detroit', value: '313 · 7 clicks', dx: 90, dy: -80 },
  { from: 12.9, to: 15, code: '212', title: 'New York', value: '212 · 5 clicks', dx: 100, dy: -60 },
  { from: 20, to: 22, code: '605', title: '77 codes', value: '5 to 21 clicks', dx: -40, dy: -80 },
  { from: 23.2, to: 27.5, code: '605', title: 'South Dakota', value: '605 · 21 clicks', dx: 70, dy: -70 },
  { from: 23.8, to: 27.5, code: '803', title: 'South Carolina', value: '803 · 21 clicks', dx: 90, dy: 60 },
  { from: 24.4, to: 27.5, code: '704', title: 'North Carolina', value: '704 · 21 clicks', dx: 110, dy: -70 },
  { from: 28.5, to: 32.5, code: '305', title: 'Florida', value: '305 · whole state', dx: 80, dy: 40 },
  { from: 29.2, to: 32.5, code: '214', title: 'Texas, one of four', value: '214 · split state', dx: -60, dy: -90 },
  { from: 39.5, to: 42.5, code: '212', title: '1992', value: '917 over Manhattan, the first overlay', dx: 110, dy: -70 },
  { from: 43.2, to: 46, code: '505', title: '2007', value: '575, the last split', dx: -70, dy: 80 },
  { from: 47.2, to: 51.5, code: '713', title: 'Houston', value: '713 · 5 codes', dx: 80, dy: 70 },
  { from: 47.8, to: 51.5, code: '212', title: 'Manhattan', value: '212 · 4 codes', dx: 110, dy: -70 },
];

/** Year shown at time t during the run, with a slow landing. */
export function yearAt(t: number): number {
  const p = clamp((t - 33) / 12);
  const eased = 1 - Math.pow(1 - p, 2.2);
  return Math.round(1947 + eased * (2025 - 1947));
}

export function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Progress of a segment [a, b] at time t. */
export function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a));
}
