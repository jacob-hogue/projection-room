/** Color ramps for the pulse scale, interpolated in OKLab so steps are perceptually even. */
import { formatHex, interpolate } from 'culori';

export interface Palette {
  name: string;
  label: string;
  /** t in 0..1, fastest to slowest. Returns a hex color. */
  ramp(t: number): string;
  /** Fixed colors for the middle-digit mode. */
  middle: { whole: string; subdivided: string; later: string };
}

export const PULSE_MIN = 5; // 212
export const PULSE_MAX = 28; // 900-series: 9 + 10 + 9
export const RAMP_STEPS = PULSE_MAX - PULSE_MIN + 1;

const SURFACE_GRAY = '#8b8fa3';

export function rampFromStops(stops: string[], steps: number): string[] {
  const f = interpolate(stops, 'oklab');
  return Array.from({ length: steps }, (_, i) => formatHex(f(steps === 1 ? 0 : i / (steps - 1))));
}

function stepped(stops: string[]): (t: number) => string {
  const colors = rampFromStops(stops, RAMP_STEPS);
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
    // The site accent family, lightest first so lightness falls with every extra click.
    ramp: stepped(['#7dd3fc', '#34d399', '#d9137f']),
    middle: { whole: '#38bdf8', subdivided: '#34d399', later: SURFACE_GRAY },
  },
  'warm-cool': {
    name: 'warm-cool',
    label: 'Warm to cool',
    ramp: stepped(['#fcd34d', '#f97316', '#6366f1']),
    middle: { whole: '#fcd34d', subdivided: '#f97316', later: SURFACE_GRAY },
  },
  mono: {
    name: 'mono',
    label: 'Mono',
    ramp: stepped(['#e8eaed', '#9aa0b4', '#5c6178']),
    middle: { whole: '#e8eaed', subdivided: '#9aa0b4', later: '#5c6178' },
  },
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;
