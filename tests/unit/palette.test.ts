import { oklab, oklch, wcagContrast } from 'culori';
import { describe, expect, test } from 'vitest';
import { PALETTES, pulseColor, rampFromStops } from '../../src/lib/palette';

const SURFACE = '#0f1117';

function lightnessDescends(colors: string[]): boolean {
  const L = colors.map((c) => oklab(c)!.l);
  return L.every((v, i) => i === 0 || v <= L[i - 1] + 1e-6);
}

describe('palette', () => {
  test('ramp has the requested steps and monotonic lightness', () => {
    const steps = rampFromStops(['#38bdf8', '#d9137f'], 24);
    expect(steps).toHaveLength(24);
    expect(lightnessDescends(steps)).toBe(true);
  });

  test('every palette ramp descends in lightness across all 24 pulse steps', () => {
    for (const p of Object.values(PALETTES)) {
      const steps = Array.from({ length: 24 }, (_, i) => p.ramp(i / 23));
      expect(lightnessDescends(steps), p.name).toBe(true);
    }
  });

  test('pulseColor clamps to the scale ends', () => {
    expect(pulseColor(PALETTES.signature, 5)).toBe(PALETTES.signature.ramp(0));
    expect(pulseColor(PALETTES.signature, 28)).toBe(PALETTES.signature.ramp(1));
    expect(pulseColor(PALETTES.signature, 40)).toBe(PALETTES.signature.ramp(1));
    expect(pulseColor(PALETTES.signature, 3)).toBe(PALETTES.signature.ramp(0));
  });

  test('middle colors are distinct and readable on the surface', () => {
    for (const p of Object.values(PALETTES)) {
      const m = p.middle;
      expect(new Set([m.whole, m.subdivided, m.later]).size).toBe(3);
      for (const c of Object.values(m)) expect(wcagContrast(c, SURFACE), `${p.name} ${c}`).toBeGreaterThan(3);
    }
  });

  test('palettes are keyed by their names and carry labels', () => {
    for (const [key, p] of Object.entries(PALETTES)) {
      expect(p.name).toBe(key);
      expect(p.label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(PALETTES)).toEqual(['signature', 'cool', 'mono']);
  });

  test('colored ramps never pass through gray', () => {
    for (const p of [PALETTES.signature, PALETTES.cool]) {
      const chroma = Array.from({ length: 24 }, (_, i) => oklch(p.ramp(i / 23))!.c ?? 0);
      expect(Math.min(...chroma), p.name).toBeGreaterThan(0.08);
    }
  });

  test('signature reads speed as brightness: gold at five pulses, deep at twenty-eight', () => {
    const fast = oklch(pulseColor(PALETTES.signature, 5))!;
    const slow = oklch(pulseColor(PALETTES.signature, 28))!;
    expect(fast.l).toBeGreaterThan(0.88);
    expect(slow.l).toBeLessThan(0.45);
    expect(fast.h).toBeGreaterThan(70);
    expect(fast.h).toBeLessThan(110);
  });

  test('ramp output is a hex string', () => {
    expect(PALETTES.signature.ramp(0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
