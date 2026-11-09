/**
 * The film's timeline in seconds. Every value here is deterministic in t, so a frame can be
 * rendered on its own. The page's story steps follow the same order.
 */
export const FPS = 30;
export const FILM_SECONDS = 90;
export const LOOP_FROM = 56;
export const LOOP_SECONDS = 7;

export const STAGE_W = 1480;
export const STAGE_H = 840;

export interface Caption {
  from: number;
  to: number;
  text: string;
}

export const TITLE = 'The dial-pulse map';
export const SOURCE = 'Area code polygons: UCLA Geoportal, 2015 · Lineage: NANPA and Wikipedia · 1950 population: Census Bureau';
export const URL_LINE = 'jacob-hogue.github.io/projection-room';

export const CAPTIONS: Caption[] = [
  { from: 0, to: 7, text: 'Before touchscreens, phones sent electrical pulses as the dial spun back. Every digit took time.' },
  { from: 7, to: 14, text: 'In 1947, New York received 212, the fastest area code in the American numbering plan.' },
  { from: 14, to: 24, text: 'Chicago and Los Angeles took six clicks. Detroit took seven. The largest industrial cities got remarkably short codes.' },
  { from: 24, to: 34, text: 'Across the country, 77 area codes ranged from five clicks to 21. Every territory had its own dialing cost.' },
  { from: 34, to: 43, text: 'South Dakota, South Carolina and North Carolina took 21 clicks. The slowest codes did not always serve small populations.' },
  { from: 43, to: 52, text: 'A middle digit marked the territory. Zero meant one code for the state. One meant it was divided.' },
  { from: 52, to: 74, text: 'The map kept dividing until 2007. Then overlays added new codes without moving the boundaries. By 2025, there were 367.' },
  { from: 74, to: 83, text: "Today, 367 codes cover 237 territories. Houston's original territory carries five. Manhattan's still carries 212." },
  { from: 83, to: FILM_SECONDS, text: '' },
];

export const END_LINE = 'The usual explanation is that shorter codes saved time in busy places. The pattern is clear. The reason is disputed.';

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
  { from: 10.5, to: 13.6, code: '212', title: 'New York', value: '212 · 5 clicks', dx: 110, dy: -80 },
  { from: 16.8, to: 23.6, code: '312', title: 'Chicago', value: '312 · 6 clicks', dx: -60, dy: -90 },
  { from: 18.6, to: 23.6, code: '213', title: 'Los Angeles', value: '213 · 6 clicks', dx: 90, dy: 80 },
  { from: 20.4, to: 23.6, code: '313', title: 'Detroit', value: '313 · 7 clicks', dx: 90, dy: -80 },
  { from: 31.6, to: 33.6, code: '605', title: '77 codes', value: '5 to 21 clicks', dx: -40, dy: -80 },
  { from: 36, to: 42.6, code: '605', title: 'South Dakota', value: '605 · 21 clicks', dx: 70, dy: -70 },
  { from: 37.6, to: 42.6, code: '803', title: 'South Carolina', value: '803 · 21 clicks', dx: 90, dy: 60 },
  { from: 39.2, to: 42.6, code: '704', title: 'North Carolina', value: '704 · 21 clicks', dx: 110, dy: -70 },
  { from: 45.5, to: 51.6, code: '305', title: 'Florida', value: '305 · whole state', dx: 80, dy: 40 },
  { from: 47.8, to: 51.6, code: '214', title: 'Texas, one of four', value: '214 · split state', dx: -60, dy: -90 },
  { from: 61.6, to: 64.8, code: '212', title: '1992', value: '917, the first overlay', dx: 40, dy: 120 },
  { from: 65.4, to: 68.8, code: '505', title: '2007', value: '575, the last split', dx: -70, dy: 80 },
  { from: 76, to: 82.6, code: '713', title: 'Houston', value: '713 · 5 codes', dx: 80, dy: 70 },
  { from: 78.4, to: 82.6, code: '212', title: 'Manhattan', value: '212 · 4 codes', dx: 40, dy: 120 },
];

/** Year shown at time t during the run, with a slow landing. */
export function yearAt(t: number): number {
  const p = clamp((t - 53) / 19);
  const eased = 1 - Math.pow(1 - p, 1.4);
  return Math.round(1947 + eased * (2025 - 1947));
}

export function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Progress of a segment [a, b] at time t. */
export function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a));
}
