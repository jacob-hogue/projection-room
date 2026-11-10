import { describe, expect, test } from 'vitest';
import { freshColor, revealOrder, yearColor } from '../../pieces/one-source/film/src/parcelstage';

describe('parcel stage ramps', () => {
  test('fresh and year map onto the same five greens', () => {
    expect(freshColor(null)).toBe('#172230');
    expect(freshColor(0)).toBe('#1b2a30');
    expect(freshColor(1)).toBe('#4ade80');
    expect(yearColor(2012)).toBe('#1b2a30');
    expect(yearColor(2026)).toBe('#4ade80');
    expect(yearColor(null)).toBe('#172230');
  });

  test('revealOrder puts nulls first then ascending values', () => {
    expect(revealOrder([2020, null, 2012, 2026])).toEqual([1, 2, 0, 3]);
  });
});
