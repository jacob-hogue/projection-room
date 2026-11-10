/**
 * The film's picture at time t, as one description both stages (main map and inset) apply.
 * Everything here is a pure function of t, so any frame renders on its own.
 */
import type { FrameState, MapStage, Mode, ShownAlpha } from '../../../../src/lib/mapstage';
import { EASE, RUN, S, seg, yearAt } from './beats';

export interface Frame {
  /** Fills and boundaries blend from `from` to `to` by `p`. */
  from: FrameState;
  to: FrameState;
  p: number;
  /** Opening shots: the data layers are hidden except the named territories. */
  blank: boolean;
  shown: ShownAlpha[];
  /** Progress of the 77 reveal; 1 when the full map is up. */
  reveal: number;
  /** Spotlight: everything else dims by `dim` toward the dim level. */
  focus: string[] | null;
  dim: number;
  labels: number;
  inset: { opacity: number; label: string } | null;
}

const still = (year: number, mode: Mode): Pick<Frame, 'from' | 'to' | 'p'> => ({ from: { year, mode }, to: { year, mode }, p: 1 });

export function frameAt(t: number): Frame {
  const base: Frame = { ...still(1947, 'pulses'), blank: false, shown: [], reveal: 1, focus: null, dim: 1, labels: 0, inset: null };

  if (t < S.newYork) return { ...base, blank: true, reveal: 0 };

  if (t < S.cities) {
    const a = EASE.out(seg(t, S.newYork + 0.8, S.newYork + 0.8 + EASE.state));
    return {
      ...base,
      blank: true,
      reveal: 0,
      shown: [{ code: '212', alpha: a }],
      inset: { opacity: EASE.out(seg(t, S.newYork + 1.4, S.newYork + 1.4 + EASE.state)), label: 'New York, 1947' },
    };
  }

  if (t < S.contrast) {
    const city = (at: number) => EASE.out(seg(t, S.cities + at, S.cities + at + EASE.state));
    return {
      ...base,
      blank: true,
      reveal: 0,
      shown: [
        { code: '212', alpha: 1 },
        { code: '213', alpha: city(1.0) },
        { code: '312', alpha: city(3.0) },
        { code: '313', alpha: city(5.0) },
      ],
    };
  }

  if (t < S.middle) {
    const reveal = seg(t, S.contrast + 0.6, S.contrast + 4.6);
    const dimOn = t >= S.contrast + 9.0;
    return {
      ...base,
      reveal,
      labels: reveal >= 1 && !dimOn ? EASE.out(seg(t, S.contrast + 4.8, S.contrast + 4.8 + EASE.state)) : 0,
      focus: dimOn ? ['605', '704'] : null,
      dim: dimOn ? EASE.inOut(seg(t, S.contrast + 9.0, S.contrast + 9.0 + EASE.state)) : 1,
    };
  }

  if (t < S.changes) {
    // The color scheme cross-fades while the slow-code spotlight eases out.
    const p = EASE.inOut(seg(t, S.middle + 0.2, S.middle + 0.2 + EASE.reveal));
    return {
      ...base,
      from: { year: 1947, mode: 'pulses' },
      to: { year: 1947, mode: 'middle' },
      p,
      focus: p < 1 ? ['605', '704'] : null,
      dim: p < 1 ? 1 - p : 1,
    };
  }

  if (t < S.present) {
    const y = yearAt(t);
    const y0 = Math.floor(y);
    const y1 = Math.min(2025, Math.ceil(y));
    let focus: string[] | null = null;
    let dim = 1;
    const spot = (code: string, from: number, to: number) => {
      focus = [code];
      dim = Math.min(EASE.inOut(seg(t, from, from + EASE.state)), 1 - EASE.inOut(seg(t, to - EASE.state, to)));
    };
    if (t >= RUN.split1948 && t < RUN.runTo1992) spot('219', RUN.split1948, RUN.runTo1992);
    else if (t >= RUN.hold1992 && t < RUN.runTo2007) spot('212', RUN.hold1992, RUN.runTo2007);
    else if (t >= RUN.hold2007 && t < RUN.runTo2025) spot('575', RUN.hold2007, RUN.runTo2025);
    const insetOn = t >= RUN.hold1992 - 0.4 && t < RUN.runTo2007 + 0.4;
    return {
      ...base,
      from: { year: y0, mode: 'pulses' },
      to: { year: y1, mode: 'pulses' },
      p: y1 === y0 ? 1 : y - y0,
      focus,
      dim,
      inset: insetOn
        ? {
            opacity: Math.min(EASE.out(seg(t, RUN.hold1992 - 0.4, RUN.hold1992 + 0.4)), 1 - seg(t, RUN.runTo2007 - 0.2, RUN.runTo2007 + 0.4)),
            label: 'Manhattan, 1992',
          }
        : null,
    };
  }

  if (t < S.conclusion) {
    return {
      ...base,
      ...still(2025, 'pulses'),
      focus: ['713', '404', '214', '212'],
      dim: EASE.inOut(seg(t, S.present + 1.0, S.present + 1.0 + EASE.state)),
      labels: EASE.out(seg(t, S.present + 0.4, S.present + 0.4 + EASE.state)),
      inset: { opacity: EASE.out(seg(t, S.present + 1.8, S.present + 1.8 + EASE.state)), label: 'Manhattan, 2025' },
    };
  }

  // The spotlight eases out under the conclusion.
  const undim = EASE.inOut(seg(t, S.conclusion + 0.2, S.conclusion + 0.2 + EASE.reveal));
  return { ...base, ...still(2025, 'pulses'), labels: 1, focus: undim < 1 ? ['713', '404', '214', '212'] : null, dim: undim < 1 ? 1 - undim : 1 };
}

/** Apply a frame to a stage. `order` is the reveal order (fastest code first). */
export function applyFrame(stage: MapStage, f: Frame, order: string[]): void {
  if (f.blank) {
    stage.setBlank(true, 0);
    stage.blendAt(f.from, f.to, f.p);
    stage.showAt(f.shown);
    stage.setLabels(false);
    return;
  }
  if (f.reveal < 1) {
    stage.setBlank(false, 0);
    stage.blendAt(f.from, f.to, f.p);
    stage.revealAt(order, f.reveal);
    stage.setLabels(false);
    return;
  }
  stage.setBlank(false, 0);
  stage.blendAt(f.from, f.to, f.p);
  // No focus means full brightness, whatever dim says; dimAt(null, 0) would read as fully dimmed.
  stage.dimAt(f.focus, f.focus ? f.dim : 1);
  stage.setLabels(f.labels > 0);
  stage.setLabelOpacity(f.labels);
}
