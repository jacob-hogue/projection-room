import { describe, expect, test } from 'vitest';
import { CAPTIONS, DISSOLVE, FILM_SECONDS, S, chapterAt } from '../../pieces/one-source/film/src/beats';
import { frameAt } from '../../pieces/one-source/film/src/frame';

describe('captions', () => {
  test('cover the film with no gaps or overlaps', () => {
    expect(CAPTIONS[0].from).toBe(0);
    for (let i = 1; i < CAPTIONS.length; i++) expect(CAPTIONS[i].from).toBe(CAPTIONS[i - 1].to);
    expect(CAPTIONS.at(-1)!.to).toBe(FILM_SECONDS);
  });

  test('hold long enough to read', () => {
    for (const c of CAPTIONS) {
      if (!c.text) continue;
      const words = c.text.split(/\s+/).length;
      expect(c.to - c.from, c.text.slice(0, 40)).toBeGreaterThanOrEqual(4 + 0.1 * words);
    }
  });
});

describe('frameAt', () => {
  test('names the chapter and dissolves in at its start', () => {
    expect(chapterAt(S.problem)).toBe(0);
    expect(chapterAt(S.map)).toBe(4);
    expect(frameAt(S.architecture).alpha).toBe(0);
    expect(frameAt(S.architecture + DISSOLVE).alpha).toBe(1);
    expect(frameAt(S.architecture + 3).local).toBeCloseTo(3);
  });
});
