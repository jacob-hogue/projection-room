import { describe, expect, test } from 'vitest';
import { readHash, writeHash } from '../../src/lib/hashstate';

describe('hashstate', () => {
  test('defaults', () => {
    expect(readHash('')).toEqual({ year: 1947, mode: 'pulses', palette: 'signature' });
    expect(readHash('#')).toEqual({ year: 1947, mode: 'pulses', palette: 'signature' });
  });

  test('bad values fall back', () => {
    expect(readHash('#year=1900&palette=nope&mode=x')).toEqual({ year: 1947, mode: 'pulses', palette: 'signature' });
    expect(readHash('#year=abc')).toEqual({ year: 1947, mode: 'pulses', palette: 'signature' });
    expect(readHash('#year=2026')).toEqual({ year: 1947, mode: 'pulses', palette: 'signature' });
  });

  test('round trip', () => {
    expect(readHash(writeHash({ year: 1999, mode: 'middle', palette: 'mono' }))).toEqual({
      year: 1999,
      mode: 'middle',
      palette: 'mono',
    });
  });

  test('writeHash is a hash fragment with only the three keys', () => {
    expect(writeHash({ year: 2025, mode: 'year', palette: 'cool' })).toBe('#year=2025&mode=year&palette=cool');
  });

  test('partial hashes keep the other defaults', () => {
    expect(readHash('#mode=year')).toEqual({ year: 1947, mode: 'year', palette: 'signature' });
  });
});
