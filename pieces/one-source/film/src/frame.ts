/** The film's state at time t, as a pure function: which chapter, how far into it, and the dissolve. */
import { DISSOLVE, EASE, chapterAt, chapterStart, seg } from './beats';

export interface Frame {
  t: number;
  /** -1 opening, 0..4 the chapters, 5 the end card. */
  chapter: number;
  /** Seconds since the chapter started. */
  local: number;
  /** Cross-dissolve weight of the current chapter, 0 to 1 over DISSOLVE at its start. */
  alpha: number;
}

export function frameAt(t: number): Frame {
  const chapter = chapterAt(t);
  const start = chapterStart(chapter);
  return { t, chapter, local: t - start, alpha: seg(t, start, start + DISSOLVE) };
}

/** Eased entrance progress for an element that starts at `at` seconds into its chapter. */
export function enterAt(local: number, at: number, dur: number = EASE.enter): number {
  return EASE.out(seg(local, at, at + dur));
}

/** Progress of a stagger: item i of n enters `gap` seconds after the previous one. */
export function staggerAt(local: number, at: number, i: number, gap: number, dur: number = EASE.enter): number {
  return enterAt(local, at + i * gap, dur);
}
