import { describe, expect, test } from 'vitest';
import { countOnOrAfter, formatDate, latestRows, share } from '../../pieces/parcel-problem/film/src/changes';

const P = [
  { loc: 'M_b', edit: 20260526 },
  { loc: 'M_a', edit: 20260526 },
  { loc: 'M_c', edit: 20250101 },
  { loc: 'M_d', edit: null },
];

describe('changes', () => {
  test('latestRows keeps the newest batch sorted by loc', () => {
    expect(latestRows(P).map((r) => r.loc)).toEqual(['M_a', 'M_b']);
    expect(latestRows(P, 1)).toHaveLength(1);
    expect(latestRows(P)[0].kind).toBe('changed');
  });

  test('counts and formats', () => {
    expect(countOnOrAfter(P, 20250101)).toBe(3);
    expect(formatDate(20260526)).toBe('2026-05-26');
    expect(share(618, 7164)).toBe('8.6%');
  });
});
