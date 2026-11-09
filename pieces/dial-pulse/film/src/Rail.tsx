/** The right-hand rail: big numbers, a legend when the color meaning changes, the year counter. */
import { PALETTES, pulseColor } from '../../../../src/lib/palette';

const TEXT = '#e8eaed';
const TEXT_2 = '#8b8fa3';
const ACCENT = '#4ade80';
const SANS = '"DM Sans", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export interface StatProps {
  eyebrow: string;
  code: string;
  number: string;
  unit: string;
  note?: string;
  opacity: number;
}

/** 1947 · NEW YORK / 212 / 5 pulses */
export const Stat: React.FC<StatProps> = ({ eyebrow, code, number, unit, note, opacity }) => (
  <div style={{ opacity, transform: `translateY(${(1 - opacity) * 10}px)`, fontFamily: SANS }}>
    <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase' }}>{eyebrow}</div>
    <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 500, color: TEXT, lineHeight: 1.1, letterSpacing: '0.04em', marginTop: 6 }}>{code}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
      <span style={{ fontSize: 88, fontWeight: 700, color: ACCENT, lineHeight: 1, letterSpacing: '-0.03em' }}>{number}</span>
      <span style={{ fontSize: 26, color: TEXT_2 }}>{unit}</span>
    </div>
    {note ? <div style={{ fontSize: 20, color: TEXT_2, marginTop: 10, lineHeight: 1.35 }}>{note}</div> : null}
  </div>
);

export interface Row {
  code: string;
  name: string;
  sub?: string;
  value: string;
  color?: string;
}

/** A short table: code, place, value. Rows fade in one by one. */
export const Rows: React.FC<{ eyebrow: string; rows: Row[]; shown: number; opacity: number }> = ({ eyebrow, rows, shown, opacity }) => (
  <div style={{ opacity, fontFamily: SANS }}>
    <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 14 }}>{eyebrow}</div>
    {rows.map((r, i) => (
      <div key={r.code} style={{ display: 'grid', gridTemplateColumns: '18px 86px 1fr auto', alignItems: 'baseline', gap: 14, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)', opacity: i < shown ? 1 : 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: r.color ?? 'transparent', display: 'inline-block', alignSelf: 'center' }} />
        <span style={{ fontFamily: MONO, fontSize: 26, color: TEXT }}>{r.code}</span>
        <span style={{ fontSize: 22, color: TEXT_2, lineHeight: 1.2 }}>
          {r.name}
          {r.sub ? <span style={{ display: 'block', fontSize: 16, color: TEXT_2, opacity: 0.8, marginTop: 2 }}>{r.sub}</span> : null}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 22, color: ACCENT }}>{r.value}</span>
      </div>
    ))}
  </div>
);

/** Clicks legend: a stepped ramp from 5 to 21 with a few labeled stops. */
export const ClicksLegend: React.FC<{ opacity: number }> = ({ opacity }) => {
  const stops = Array.from({ length: 17 }, (_, i) => 5 + i);
  return (
    <div style={{ opacity, fontFamily: MONO }}>
      <div style={{ fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 10 }}>Pulses to dial</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {stops.map((p) => (
          <div key={p} style={{ flex: 1, height: 16, background: pulseColor(PALETTES.signature, p), borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, color: TEXT_2, marginTop: 6 }}>
        <span>5</span>
        <span>9</span>
        <span>13</span>
        <span>17</span>
        <span>21</span>
      </div>
    </div>
  );
};

export const MiddleLegend: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div style={{ opacity, fontFamily: MONO }}>
    <div style={{ fontSize: 15, letterSpacing: '0.1em', color: TEXT_2, textTransform: 'uppercase', marginBottom: 10 }}>Middle digit</div>
    {[
      { color: PALETTES.signature.middle.whole, text: '0 · one code for the whole state · 35' },
      { color: PALETTES.signature.middle.subdivided, text: '1 · the state was divided · 42' },
    ].map((r) => (
      <div key={r.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 17, color: TEXT }}>
        <span style={{ width: 22, height: 16, borderRadius: 3, background: r.color, display: 'inline-block' }} />
        <span>{r.text}</span>
      </div>
    ))}
  </div>
);

export const Counter: React.FC<{ year: number; count: number; opacity: number }> = ({ year, count, opacity }) => (
  <div style={{ opacity, fontFamily: MONO, textAlign: 'right' }}>
    <div style={{ fontSize: 96, fontWeight: 500, color: TEXT, lineHeight: 1, letterSpacing: '-0.02em' }}>{year}</div>
    <div style={{ fontSize: 22, color: TEXT_2, marginTop: 8 }}>{count} area codes</div>
  </div>
);
