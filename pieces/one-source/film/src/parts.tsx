/** Reusable parts: node cards, arrows that draw in, chips, counting stats, the step rail. */
import { EASE } from './beats';
import type { Node, Segment } from './diagram';
import { segmentLength } from './diagram';
import { MONO } from './fonts';
import { C, LINE, TYPE } from './theme';

export const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** The shared entrance: rise 12 px and fade. */
export const rise = (enter: number): React.CSSProperties => ({ opacity: enter, transform: `translateY(${(1 - enter) * 12}px)` });

export const eyebrow = (color: string = C.muted): React.CSSProperties => ({
  fontFamily: MONO,
  fontSize: 13,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color,
});

interface NodeCardProps {
  node: Node;
  enter: number;
  /** Green glow and border for the source of record. */
  live?: boolean;
  /** Pulse of the glow, 0..1, for the moment the source arrives. */
  pulse?: number;
  children: React.ReactNode;
}

/** A diagram card placed by its node. */
export const NodeCard: React.FC<NodeCardProps> = ({ node, enter, live = false, pulse = 0, children }) => {
  const outputLike = node.kind === 'output';
  const border = live || outputLike ? C.green : C.hairline;
  const background = live ? 'rgba(74,222,128,0.10)' : node.kind === 'writer' || node.kind === 'log' || node.kind === 'readers' ? C.surface : C.raised;
  const glow = live ? `0 0 0 ${6 + pulse * 10}px rgba(74,222,128,${0.08 + pulse * 0.10})` : 'none';
  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        boxSizing: 'border-box',
        padding: node.kind === 'source' ? 20 : node.kind === 'step' ? '14px 16px' : '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        background,
        border: `1px solid ${border}`,
        borderRadius: node.kind === 'source' ? 12 : 10,
        boxShadow: glow,
        fontSize: 18,
        lineHeight: '24px',
        ...rise(enter),
      }}
    >
      {children}
    </div>
  );
};

/** A straight segment drawn tail to head by `draw` (0..1); the head appears when the line completes. */
export const Arrow: React.FC<{ seg: Segment; draw: number }> = ({ seg, draw }) => {
  const color = seg.color === 'green' ? C.green : C.grey;
  const len = segmentLength(seg);
  const pad = 8;
  const left = Math.min(seg.x1, seg.x2) - pad;
  const top = Math.min(seg.y1, seg.y2) - pad;
  const w = Math.abs(seg.x2 - seg.x1) + pad * 2;
  const h = Math.abs(seg.y2 - seg.y1) + pad * 2;
  const dx = Math.sign(seg.x2 - seg.x1);
  const dy = Math.sign(seg.y2 - seg.y1);
  const ax = seg.x1 - left;
  const ay = seg.y1 - top;
  const bx = seg.x2 - left;
  const by = seg.y2 - top;
  // The line stops short of the tip so the head covers its end.
  const short = seg.head ? 5 : 0;
  const lx = bx - dx * short;
  const ly = by - dy * short;
  const lineLen = Math.max(0, len - short);
  const headOn = seg.head && draw >= 0.999;
  // Triangle at the tip, 10 long and 8 wide, pointing along (dx, dy).
  const px = -dy;
  const py = dx;
  const head = `${bx},${by} ${bx - dx * 10 + px * 4},${by - dy * 10 + py * 4} ${bx - dx * 10 - px * 4},${by - dy * 10 - py * 4}`;
  if (draw <= 0) return null;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left, top, width: w, height: h, overflow: 'visible' }} aria-hidden="true">
      <line x1={ax} y1={ay} x2={lx} y2={ly} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray={lineLen} strokeDashoffset={lineLen * (1 - Math.min(1, draw))} />
      {headOn ? <polygon points={head} fill={color} /> : null}
    </svg>
  );
};

export type ChipKind = 'added' | 'changed' | 'removed';

const CHIP: Record<ChipKind, { glyph: string; color: string; bg: string; border: string }> = {
  added: { glyph: '+', color: C.green, bg: 'rgba(74,222,128,0.12)', border: C.green },
  changed: { glyph: '~', color: C.amber, bg: 'rgba(227,165,61,0.12)', border: C.amber },
  removed: { glyph: '−', color: C.removed, bg: C.raised, border: C.hairline },
};

/** A record chip; the glyph and the colour both carry the state. */
export const Chip: React.FC<{ kind: ChipKind; children: React.ReactNode }> = ({ kind, children }) => {
  const s = CHIP[kind];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, fontFamily: MONO, fontSize: 16, color: s.color }}>
      <span style={{ fontWeight: 500 }}>{s.glyph}</span>
      <span style={{ textDecoration: kind === 'removed' ? 'line-through' : 'none' }}>{children}</span>
    </span>
  );
};

interface StatProps {
  eyebrow: string;
  /** A number counts up with `enter`; a string is shown as is. */
  value: number | string;
  note?: string;
  enter: number;
  live?: boolean;
  size?: number;
}

/** A labelled number. The count runs with the entrance. */
export const Stat: React.FC<StatProps> = ({ eyebrow: eb, value, note, enter, live = false, size = 52 }) => {
  const shown = typeof value === 'number' ? fmt(value * EASE.out(enter)) : value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box', padding: '22px 26px', borderRadius: 12, background: live ? 'rgba(74,222,128,0.10)' : C.surface, border: `1px solid ${live ? C.green : C.hairline}`, ...rise(enter) }}>
      <div style={eyebrow(live ? C.green : C.muted)}>{eb}</div>
      <div style={{ fontFamily: MONO, fontSize: size, lineHeight: `${size + 4}px`, fontWeight: 500, color: live ? C.green : C.text }}>{shown}</div>
      {note ? <div style={{ fontSize: 17, color: C.secondary }}>{note}</div> : null}
    </div>
  );
};

export const STEPS = ['Detect changes', 'Validate', 'Publish', 'Serve'] as const;

/** The four pipeline steps down the left, the active one in green. */
export const StepRail: React.FC<{ active: number; enter: number; left: number; top: number }> = ({ active, enter, left, top }) => (
  <div style={{ position: 'absolute', left, top, width: 340, display: 'flex', flexDirection: 'column', gap: 14, ...rise(enter) }}>
    {STEPS.map((name, i) => {
      const on = i === active;
      const done = i < active;
      return (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 76, boxSizing: 'border-box', padding: '0 18px', borderRadius: 10, background: on ? 'rgba(74,222,128,0.10)' : C.surface, border: `1px solid ${on ? C.green : C.hairline}` }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? C.green : C.raised, border: `1px solid ${on ? C.green : C.hairline}`, color: on ? C.greenInk : done ? C.green : C.secondary, fontFamily: MONO, fontSize: 16, fontWeight: on ? 500 : 400 }}>
            {done ? '✓' : `0${i + 1}`}
          </div>
          <div style={{ fontSize: TYPE.data, lineHeight: `${LINE.data}px`, fontWeight: on ? 500 : 400, color: on ? C.text : C.secondary }}>{name}</div>
        </div>
      );
    })}
  </div>
);
