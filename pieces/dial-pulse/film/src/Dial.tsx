/** A rotary dial dialing 212 during the opening seconds, drawn from t alone. */
import { seg } from './beats';

const HOLES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const R = 120;
const angleOf = (i: number) => -(60 + i * 30);
const pulsesOf = (d: string) => (d === '0' ? 10 : Number(d));
const turnFor = (d: string) => 60 + (pulsesOf(d) - 1) * 30;

/** Dial schedule for "212": wind up, then return at ten clicks a second. */
const DIGITS = [
  { digit: '2', windFrom: 0.3, windTo: 0.8, backTo: 1.0 },
  { digit: '1', windFrom: 1.4, windTo: 1.8, backTo: 1.9 },
  { digit: '2', windFrom: 2.3, windTo: 2.8, backTo: 3.0 },
];

export const Dial: React.FC<{ t: number }> = ({ t }) => {
  let angle = 0;
  let clicks = 0;
  for (const d of DIGITS) {
    const target = turnFor(d.digit);
    if (t < d.windFrom) break;
    if (t < d.windTo) {
      angle = target * easeInOut(seg(t, d.windFrom, d.windTo));
      break;
    }
    if (t < d.backTo) {
      const back = seg(t, d.windTo, d.backTo);
      angle = target * (1 - back);
      clicks += Math.floor(back * pulsesOf(d.digit));
      break;
    }
    clicks += pulsesOf(d.digit);
  }
  const fade = Math.min(seg(t, 0, 0.4), 1 - seg(t, 4.0, 4.5));
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 56, opacity: fade }}>
      <svg viewBox="-150 -150 300 300" width={340} height={340} aria-hidden="true">
        <circle r={144} fill="#151823" stroke="rgba(255,255,255,0.08)" />
        {HOLES.map((h, i) => {
          const a = (angleOf(i) * Math.PI) / 180;
          return (
            <text key={h} x={R * Math.cos(a)} y={R * Math.sin(a)} textAnchor="middle" dominantBaseline="central" fontSize={22} fill="#8b8fa3" fontFamily="JetBrains Mono, monospace">
              {h}
            </text>
          );
        })}
        <g transform={`rotate(${angle})`}>
          <circle r={132} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
          {HOLES.map((_, i) => {
            const a = (angleOf(i) * Math.PI) / 180;
            return <circle key={i} cx={R * Math.cos(a)} cy={R * Math.sin(a)} r={22} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2.5} />;
          })}
        </g>
        <circle r={40} fill="#0f1117" stroke="rgba(255,255,255,0.1)" />
        <path d="M 144 -6 L 108 -33 L 114 -6 Z" fill="#4ade80" />
      </svg>
      <div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 64, letterSpacing: '0.14em', color: '#e8eaed' }}>212</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, minHeight: 18 }}>
          {Array.from({ length: clicks }).map((_, i) => (
            <span key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
          ))}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, color: '#8b8fa3', marginTop: 12 }}>{clicks > 0 ? `${clicks} click${clicks === 1 ? '' : 's'}` : ''}</div>
      </div>
    </div>
  );
};

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}
