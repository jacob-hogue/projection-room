/**
 * A rotary dial in the Western Electric layout, dialing 212, drawn from t alone.
 *
 * Geometry: ten finger holes 30 degrees apart in a wheel over a fixed number plate; the
 * finger stop sits at about four o'clock, with 1 two holes anticlockwise of it and 0 one
 * hole clockwise past it. Pulling a digit to the stop turns the wheel 60 + 30 (n - 1)
 * degrees. The hand winds it; the governor brings it back at a steady 300 degrees a second,
 * one pulse for every 30 degrees after the first 30, so n pulses at ten a second.
 */
import { seg } from './beats';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const LETTERS: Record<string, string> = { '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PRS', '8': 'TUV', '9': 'WXY', '0': 'OPER' };
const HOLE_R = 128; // radius of the hole ring
const STOP_DEG = 30; // finger stop, degrees clockwise from three o'clock
const RETURN_DPS = 300; // governor speed, degrees per second
const SURFACE = '#0f1117';
const TEXT = '#e8eaed';
const TEXT_2 = '#8b8fa3';
const ACCENT = '#4ade80';

const pulsesOf = (d: string) => (d === '0' ? 10 : Number(d));
/** Degrees the wheel turns to bring a digit's hole to the stop. */
const travelFor = (d: string) => 60 + (pulsesOf(d) - 1) * 30;
/** Resting angle of a hole, degrees clockwise from three o'clock (negative is above). */
const restAngle = (i: number) => STOP_DEG - 60 - 30 * i;

interface Digit {
  digit: string;
  windFrom: number;
  windTo: number;
  releaseAt: number;
}

/** Dialing 2, 1, 2: the hand takes longer for a farther digit; a short pause before release. */
function schedule(number: string, start: number): Digit[] {
  const out: Digit[] = [];
  let t = start;
  for (const digit of number) {
    const travel = travelFor(digit);
    const wind = 0.28 + travel / 400; // 2: 0.5 s, 1: 0.43 s
    out.push({ digit, windFrom: t, windTo: t + wind, releaseAt: t + wind + 0.18 });
    t += wind + 0.18 + travel / RETURN_DPS + 0.7;
  }
  return out;
}

const PLAN = schedule('212', 8.2);

/** Wheel angle (degrees clockwise) and pulses sent so far at time t. */
export function dialState(t: number): { angle: number; clicks: number; finger: number | null } {
  let clicks = 0;
  for (const d of PLAN) {
    const travel = travelFor(d.digit);
    const n = pulsesOf(d.digit);
    if (t < d.windFrom) return { angle: 0, clicks, finger: null };
    if (t < d.windTo) {
      const p = seg(t, d.windFrom, d.windTo);
      return { angle: travel * (1 - Math.pow(1 - p, 2.2)), clicks, finger: DIGITS.indexOf(d.digit) };
    }
    if (t < d.releaseAt) return { angle: travel, clicks, finger: DIGITS.indexOf(d.digit) };
    const back = (t - d.releaseAt) * RETURN_DPS;
    if (back < travel) {
      // One pulse per 30 degrees after the first 30 of return.
      const sent = Math.max(0, Math.min(n, Math.floor((back - 30) / 30)));
      return { angle: travel - back, clicks: clicks + sent, finger: null };
    }
    clicks += n;
  }
  return { angle: 0, clicks, finger: null };
}

export const Dial: React.FC<{ t: number }> = ({ t }) => {
  const { angle, clicks, finger } = dialState(t);
  const fade = Math.min(seg(t, 0.3, 0.9), 1 - seg(t, 16.2, 16.8));
  const digitsDone = PLAN.filter((d) => t >= d.releaseAt + travelFor(d.digit) / RETURN_DPS).length;
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', gap: 64, opacity: fade }}>
      <svg viewBox="-170 -170 340 340" width={380} height={380} aria-hidden="true">
        <defs>
          <radialGradient id="dial-face" cx="40%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#262b3a" />
            <stop offset="100%" stopColor="#13161f" />
          </radialGradient>
          <radialGradient id="dial-wheel" cx="40%" cy="35%" r="80%">
            <stop offset="0%" stopColor="#3a4052" />
            <stop offset="100%" stopColor="#1e2330" />
          </radialGradient>
          <linearGradient id="dial-stop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e3e6ec" />
            <stop offset="100%" stopColor="#9aa0b4" />
          </linearGradient>
        </defs>
        {/* Fixed number plate */}
        <circle r={164} fill="url(#dial-face)" stroke="rgba(255,255,255,0.10)" strokeWidth={2} />
        <circle r={154} fill="none" stroke="rgba(255,255,255,0.05)" />
        {DIGITS.map((d, i) => {
          const a = (restAngle(i) * Math.PI) / 180;
          const x = HOLE_R * Math.cos(a);
          const y = HOLE_R * Math.sin(a);
          const letters = LETTERS[d];
          return (
            <g key={d}>
              <text x={x} y={letters ? y - 4 : y} textAnchor="middle" dominantBaseline="central" fontSize={24} fontWeight={600} fill={TEXT} fontFamily="DM Sans, sans-serif">
                {d}
              </text>
              {letters ? (
                <text x={x} y={y + 15} textAnchor="middle" dominantBaseline="central" fontSize={9} letterSpacing={1} fill={TEXT_2} fontFamily="DM Sans, sans-serif">
                  {letters}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Finger wheel: a ring with ten holes, turning as one piece */}
        <g transform={`rotate(${angle})`}>
          <path
            d={wheelPath(150, 72, HOLE_R, 22)}
            fill="url(#dial-wheel)"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1.5}
            fillRule="evenodd"
          />
          {DIGITS.map((_, i) => {
            const a = (restAngle(i) * Math.PI) / 180;
            return <circle key={i} cx={HOLE_R * Math.cos(a)} cy={HOLE_R * Math.sin(a)} r={22} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={2} />;
          })}
          {finger !== null ? (
            <circle
              cx={HOLE_R * Math.cos((restAngle(finger) * Math.PI) / 180)}
              cy={HOLE_R * Math.sin((restAngle(finger) * Math.PI) / 180)}
              r={17}
              fill="rgba(232,234,237,0.22)"
              stroke="rgba(232,234,237,0.5)"
              strokeWidth={1.5}
            />
          ) : null}
        </g>
        {/* Centre card */}
        <circle r={60} fill={SURFACE} stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} />
        <circle r={52} fill="#f3efe4" opacity={0.92} />
        <text y={-6} textAnchor="middle" dominantBaseline="central" fontSize={16} fontWeight={600} fill="#2a2a2a" fontFamily="JetBrains Mono, monospace">
          212
        </text>
        <text y={14} textAnchor="middle" dominantBaseline="central" fontSize={8} letterSpacing={1.5} fill="#6b6b6b" fontFamily="DM Sans, sans-serif">
          NEW YORK
        </text>
        {/* Finger stop at four o'clock */}
        <g transform={`rotate(${STOP_DEG})`}>
          <rect x={104} y={-5} width={66} height={16} rx={7} fill="rgba(0,0,0,0.45)" />
          <rect x={102} y={-8} width={66} height={16} rx={7} fill="url(#dial-stop)" stroke="#6b7083" strokeWidth={1} />
        </g>
      </svg>
      <div style={{ minWidth: 300 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 64, letterSpacing: '0.14em', color: TEXT, lineHeight: 1 }}>
          {'212'.split('').map((ch, i) => (
            <span key={i} style={{ opacity: i < digitsDone ? 1 : 0.28 }}>{ch}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, minHeight: 18 }}>
          {Array.from({ length: clicks }).map((_, i) => (
            <span key={i} style={{ width: 18, height: 18, borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
          ))}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, color: TEXT_2, marginTop: 14 }}>
          {clicks > 0 ? `${clicks} pulse${clicks === 1 ? '' : 's'}` : ''}
        </div>
      </div>
    </div>
  );
};

/** A ring between two radii with circular holes cut out, as one even-odd path. */
function wheelPath(outer: number, inner: number, holeRadius: number, holeR: number): string {
  const ring = `M ${outer} 0 A ${outer} ${outer} 0 1 0 ${-outer} 0 A ${outer} ${outer} 0 1 0 ${outer} 0 Z M ${inner} 0 A ${inner} ${inner} 0 1 1 ${-inner} 0 A ${inner} ${inner} 0 1 1 ${inner} 0 Z`;
  const holes = DIGITS.map((_, i) => {
    const a = (restAngle(i) * Math.PI) / 180;
    const cx = holeRadius * Math.cos(a);
    const cy = holeRadius * Math.sin(a);
    return `M ${cx + holeR} ${cy} A ${holeR} ${holeR} 0 1 0 ${cx - holeR} ${cy} A ${holeR} ${holeR} 0 1 0 ${cx + holeR} ${cy} Z`;
  }).join(' ');
  return `${ring} ${holes}`;
}

