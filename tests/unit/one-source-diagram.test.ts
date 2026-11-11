import { describe, expect, test } from 'vitest';
import { NODES, edges } from '../../pieces/parcel-problem/film/src/diagram';

const byId = (id: string) => NODES.find((n) => n.id === id)!;
const onBoundary = (x: number, y: number, n: { x: number; y: number; w: number; h: number }) =>
  ((x === n.x || x === n.x + n.w) && y >= n.y && y <= n.y + n.h) || ((y === n.y || y === n.y + n.h) && x >= n.x && x <= n.x + n.w);

describe('architecture diagram', () => {
  test('every arrow head lands on a node edge, one pixel short', () => {
    const heads = edges().filter((s) => s.head);
    expect(heads.length).toBe(10);
    for (const s of heads) {
      const dx = Math.sign(s.x2 - s.x1);
      const dy = Math.sign(s.y2 - s.y1);
      const hit = NODES.some((n) => onBoundary(s.x2 + dx, s.y2 + dy, n));
      expect(hit, `${s.x2},${s.y2}`).toBe(true);
    }
  });

  test('segments are axis-aligned and the source feeds the first step', () => {
    for (const s of edges()) expect(s.x1 === s.x2 || s.y1 === s.y2).toBe(true);
    const src = byId('source');
    const detect = byId('detect');
    expect(edges().some((s) => s.x1 === src.x + src.w && s.x2 === detect.x - 1 && s.y1 === src.y + src.h / 2)).toBe(true);
  });

  test('draw order runs from the writers to the readers', () => {
    const e = edges();
    const orders = e.map((s) => s.order);
    expect(Math.min(...orders)).toBe(0);
    const into = (id: string) => e.filter((s) => s.head && NODES.some((n) => n.id === id && onBoundary(s.x2 + Math.sign(s.x2 - s.x1), s.y2 + Math.sign(s.y2 - s.y1), n)));
    expect(into('source')[0].order).toBeLessThan(into('readers')[0].order);
  });
});
