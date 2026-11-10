/** Design tokens for the One Source film: "Blueprint, dark". Pure values, no imports. */

export const C = {
  ground: '#0b0f14',
  surface: '#111821',
  raised: '#172230',
  hairline: '#26354a',
  text: '#eef2f6',
  secondary: '#9fb0c3',
  muted: '#6f8398',
  green: '#4ade80',
  greenInk: '#06130b',
  amber: '#e3a53d',
  removed: '#8696a8',
  grey: '#4a5d73',
} as const;

/** Font sizes in pixels of the 1920 by 1080 picture; line heights follow in LINE. */
export const TYPE = { display: 72, heading: 44, caption: 30, label: 18, data: 22 } as const;
export const LINE = { display: 80, heading: 52, caption: 40, label: 24, data: 28 } as const;

/** Frame grid. */
export const GRID = { safe: 64, header: 48, heading: 104, caption: 884, captionWidth: 1320, width: 1920, height: 1080 } as const;

/** Five greens, oldest to newest; the last is the accent. */
export const RAMP = ['#1b2a30', '#1f4a3a', '#237a4e', '#2fb066', '#4ade80'] as const;
