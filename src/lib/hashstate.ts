/** The explore state lives in the URL hash so a view can be copied and sent. */
import type { Mode } from './mapstage';
import { PALETTES, type PaletteName } from './palette';
import { YEAR_MAX, YEAR_MIN } from './mapstage';

export interface HashState {
  year: number;
  mode: Mode;
  palette: PaletteName;
}

export const DEFAULT_STATE: HashState = { year: YEAR_MIN, mode: 'pulses', palette: 'signature' };

const MODES: ReadonlySet<string> = new Set<Mode>(['pulses', 'middle', 'year']);

/** Invalid or out-of-range values fall back to the defaults without complaint. */
export function readHash(hash: string): HashState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: HashState = { ...DEFAULT_STATE };
  const year = Number(params.get('year'));
  if (Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX) state.year = year;
  const mode = params.get('mode');
  if (mode && MODES.has(mode)) state.mode = mode as Mode;
  const palette = params.get('palette');
  if (palette && palette in PALETTES) state.palette = palette as PaletteName;
  return state;
}

export function writeHash(state: HashState): string {
  return `#year=${state.year}&mode=${state.mode}&palette=${state.palette}`;
}
