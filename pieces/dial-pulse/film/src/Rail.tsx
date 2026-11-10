/**
 * The right-hand rail: big numbers, a legend when the color meaning changes, the year counter.
 * Every element takes an `enter` progress (0..1, already eased) and arrives by rising 12 px
 * while fading in; numbers count up as they arrive.
 */
import { PALETTES, pulseColor } from '../../../../src/lib/palette';

const TEXT = '#e8eaed';
const TEXT_2 = '#8b8fa3';
const ACCENT = '#4ade80';
const SANS = '"DM Sans", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const RISE = 12;

const arrive = (enter: number): React.CSSProperties => ({ opacity: enter, transform: `translateY(${(1 - enter) * RISE}px)` });

/** Count a number up as it arrives; non-numeric strings show as is. */
function countUp(value: string, enter: number): string {
  const n = Number(value.replace(/,/g, ''));
  if (!value || Number.isNaN(n)) return value;
  const shown = Math.round(n * enter);
  return shown.toLocaleString('en-US');
}

export interface StatProps {
  eyebrow: string;
  code: string;
  number: string;
  unit: string;
  note?: string;
  enter: number;
  /** Fades the whole block out as it goes (1 = fully present). */
  leave?: number;
}

/** 1947 · NEW YORK / 212 / 5 pulses */
export const Stat: React.FC<StatProps> = ({ eyebrow, code, number, unit, note, enter, leave = 1 }) => (
  <div style={{ ...arrive(enter), opacity: enter * leave, fontFamily: SANS }}>
    <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase' }}>{eyebrow}</div>
    <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 500, color: TEXT, lineHeight: 1.1, letterSpacing: '0.04em', marginTop: 6 }}>{code}</div>
    {number ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
        <span style={{ fontSize: 88, fontWeight: 700, color: ACCENT, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{countUp(number, enter)}</span>
        <span style={{ fontSize: 26, color: TEXT_2 }}>{unit}</span>
      </div>
    ) : null}
    {note ? <div style={{ fontSize: 20, color: TEXT_2, marginTop: 10, lineHeight: 1.35, opacity: Math.max(0, (enter - 0.4) / 0.6) }}>{note}</div> : null}
  </div>
);

export interface Row {
  code: string;
  name: string;
  sub?: string;
  value: string;
  color?: string;
}

/** A short table: code, place, value. Each row has its own arrival progress. */
export const Rows: React.FC<{ eyebrow: string; rows: Row[]; enters: number[]; enter: number }> = ({ eyebrow, rows, enters, enter }) => (
  <div style={{ ...arrive(enter), fontFamily: SANS }}>
    <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 14 }}>{eyebrow}</div>
    {rows.map((r, i) => (
      <div
        key={r.code}
        style={{
          display: 'grid',
          gridTemplateColumns: '18px 86px 1fr auto',
          alignItems: 'baseline',
          gap: 14,
          padding: '10px 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          ...arrive(enters[i] ?? 0),
        }}
      >
        <span style={{ width: 12, height: 12, borderRadius: 3, background: r.color ?? 'transparent', display: 'inline-block', alignSelf: 'center' }} />
        <span style={{ fontFamily: MONO, fontSize: 26, color: TEXT }}>{r.code}</span>
        <span style={{ fontSize: 22, color: TEXT_2, lineHeight: 1.2 }}>
          {r.name}
          {r.sub ? <span style={{ display: 'block', fontSize: 16, color: TEXT_2, opacity: 0.8, marginTop: 2 }}>{r.sub}</span> : null}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 22, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
      </div>
    ))}
  </div>
);

/** Pulses legend: a stepped ramp from 5 to 21 whose swatches fill left to right as it arrives. */
export const ClicksLegend: React.FC<{ enter: number }> = ({ enter }) => {
  const stops = Array.from({ length: 17 }, (_, i) => 5 + i);
  return (
    <div style={{ ...arrive(Math.min(1, enter * 2)), fontFamily: MONO }}>
      <div style={{ fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 10 }}>Pulses to dial</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {stops.map((p, i) => (
          <div key={p} style={{ flex: 1, height: 16, background: pulseColor(PALETTES.signature, p), borderRadius: 2, opacity: Math.min(1, Math.max(0, enter * 20 - i)) }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: TEXT_2, marginTop: 6, opacity: Math.max(0, (enter - 0.5) * 2) }}>
        <span>5</span>
        <span>9</span>
        <span>13</span>
        <span>17</span>
        <span>21</span>
      </div>
    </div>
  );
};

export const MiddleLegend: React.FC<{ enter: number }> = ({ enter }) => (
  <div style={{ ...arrive(enter), fontFamily: MONO }}>
    <div style={{ fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 10 }}>Middle digit</div>
    {[
      { color: PALETTES.signature.middle.whole, text: '0 · one code for the whole state · 35' },
      { color: PALETTES.signature.middle.subdivided, text: '1 · the state was divided · 42' },
    ].map((r, i) => (
      <div key={r.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 17, color: TEXT, ...arrive(Math.min(1, Math.max(0, enter * 1.5 - i * 0.4))) }}>
        <span style={{ width: 22, height: 16, borderRadius: 3, background: r.color, display: 'inline-block' }} />
        <span>{r.text}</span>
      </div>
    ))}
  </div>
);

export const Counter: React.FC<{ year: number; count: number; enter: number }> = ({ year, count, enter }) => (
  <div style={{ ...arrive(enter), fontFamily: MONO, textAlign: 'right' }}>
    <div style={{ fontSize: 96, fontWeight: 500, color: TEXT, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{year}</div>
    <div style={{ fontSize: 22, color: TEXT_2, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{count} area codes</div>
  </div>
);
