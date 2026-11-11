import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CATEGORIES, PIECES, pieceBySlug } from '../../src/content/pieces';

describe('the piece manifest', () => {
  test('every piece has a page, a known category and a demonstrates line', () => {
    const slugs = PIECES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of PIECES) {
      expect(existsSync(join(process.cwd(), 'src', 'pages', p.slug, 'index.astro')), p.slug).toBe(true);
      expect(Object.keys(CATEGORIES)).toContain(p.category);
      expect(p.demonstrates.length).toBeGreaterThanOrEqual(2);
      expect(p.rule.length).toBeGreaterThan(20);
    }
  });

  test('pieceBySlug finds a piece and names the categories the index filters on', () => {
    expect(pieceBySlug('parcel-problem')?.category).toBe('architecture');
    expect(pieceBySlug('dial-pulse')?.category).toBe('visualization');
    expect(pieceBySlug('spatial-join')?.category).toBe('engineering');
    expect(pieceBySlug('nope')).toBeUndefined();
    expect(CATEGORIES.visualization.label).toBe('Data visualization');
    expect(CATEGORIES.architecture.label).toBe('Solution architecture');
  });
});
