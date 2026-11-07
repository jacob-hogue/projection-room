import { describe, expect, test } from 'vitest';
import { codesInEffect, displayCode, hasOverlay, loadLineage, originalOf } from '../../src/lib/lineage';
import fixture from '../fixtures/lineage-small.json';

const L = loadLineage(fixture);

describe('lineage', () => {
  test('originalOf walks to the 1947 code', () => {
    expect(originalOf('347', L)).toBe('212');
    expect(originalOf('212', L)).toBe('212');
  });

  test('codesInEffect by year', () => {
    expect(codesInEffect(1947, L)).toEqual(new Set(['212']));
    expect(codesInEffect(2000, L)).toEqual(new Set(['212', '718', '917', '347']));
  });

  test('displayCode is the earliest code in effect, ties broken numerically', () => {
    expect(displayCode(['718', '347'], 2000, L)).toBe('718');
    expect(displayCode(['212', '917'], 2000, L)).toBe('212');
  });

  test('hasOverlay', () => {
    expect(hasOverlay(['718', '347'], 2000, L)).toBe(true);
    expect(hasOverlay(['718'], 1990, L)).toBe(false);
  });

  test('unknown code throws', () => {
    expect(() => originalOf('999', L)).toThrow(/999/);
  });
});
