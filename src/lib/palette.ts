/** Color ramps for the pulse scale, interpolated in OKLab or OKLCH so steps are perceptually even. */
import { formatHex, interpolate } from 'culori';

export interface Palette {
  name: string;
  label: string;
  /** t in 0..1, fastest to slowest. Returns a hex color. */
  ramp(t: number): string;
  /** Fixed colors for the middle-digit mode. */
  middle: { whole: string; subdivided: string; later: string };
}

export type RampSpace = 'oklab' | 'oklch';

export const PULSE_MIN = 5; // 212
export const PULSE_MAX = 28; // 900-series: 9 + 10 + 9
export const RAMP_STEPS = PULSE_MAX - PULSE_MIN + 1;

const LATER_GRAY = '#8b8fa3';

export function rampFromStops(stops: string[], steps: number, space: RampSpace = 'oklab'): string[] {
  const f = interpolate(stops, space);
  return Array.from({ length: steps }, (_, i) => formatHex(f(steps === 1 ? 0 : i / (steps - 1))));
}

function stepped(stops: string[], space: RampSpace): (t: number) => string {
  const colors = rampFromStops(stops, RAMP_STEPS, space);
  return (t) => colors[Math.round(Math.min(1, Math.max(0, t)) * (RAMP_STEPS - 1))];
}

export function pulseColor(p: Palette, pulses: number): string {
  const clamped = Math.min(PULSE_MAX, Math.max(PULSE_MIN, pulses));
  return p.ramp((clamped - PULSE_MIN) / (PULSE_MAX - PULSE_MIN));
}

export const PALETTES = {
  signature: {
    name: 'signature',
    label: 'Signature',
    // Speed reads as brightness: gold for five pulses down to a near-black plum for
    // twenty-eight. Chroma stays moderate through the middle so the common twelve to
    // twenty pulse territories read as a quiet rose and the gold highlights carry the map.
    ramp: stepped(['#f5d98a', '#e2876f', '#c04a84', '#6a3389', '#3b2563'], 'oklch'),
    middle: { whole: '#f5d98a', subdivided: '#e2876f', later: LATER_GRAY },
  },
  cool: {
    name: 'cool',
    label: 'Cool',
    // Sky through blue and violet to a deep indigo.
    ramp: stepped(['#7dd3fc', '#38bdf8', '#6366f1', '#1e1b4b'], 'oklch'),
    middle: { whole: '#7dd3fc', subdivided: '#6366f1', later: LATER_GRAY },
  },
  mono: {
    name: 'mono',
    label: 'Mono',
    ramp: stepped(['#e8eaed', '#9aa0b4', '#5c6178'], 'oklab'),
    middle: { whole: '#e8eaed', subdivided: '#9aa0b4', later: '#5c6178' },
  },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
