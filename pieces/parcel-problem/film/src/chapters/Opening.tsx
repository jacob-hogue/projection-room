import { BRIEF, BRIEF_NOTE, BYLINE, EASE, TITLE } from '../beats';
import { MONO } from '../fonts';
import { enterAt, staggerAt } from '../frame';
import { rise } from '../parts';
import { C, GRID } from '../theme';

/** The title card is a brief: scenario, users, problem, assumptions, solution, one line after another. */
export const Opening: React.FC<{ local: number }> = ({ local }) => (
  <div style={{ position: 'absolute', left: GRID.safe, top: GRID.heading, width: 1792, display: 'flex', flexDirection: 'column', gap: 28 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...rise(enterAt(local, 0.4, EASE.reveal)) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
        <div style={{ fontSize: 72, lineHeight: '80px', fontWeight: 600, letterSpacing: '-0.015em' }}>{TITLE}</div>
        <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>{BYLINE}</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: '0.1em', color: C.muted }}>{BRIEF_NOTE}</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.hairline}` }}>
      {BRIEF.map((row, i) => {
        const enter = staggerAt(local, 1.4, i, 1.6, EASE.reveal);
        const isSolution = row.label === 'Solution';
        const color = isSolution ? C.green : row.label === 'Problem' ? C.amber : C.secondary;
        return (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, alignItems: 'baseline', padding: '24px 0', borderBottom: `1px solid ${C.hairline}`, ...rise(enter) }}>
            <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>{row.label}</div>
            <div style={{ maxWidth: 1300, fontSize: 34, lineHeight: '46px', fontWeight: isSolution ? 500 : 400, color: C.text }}>{row.text}</div>
          </div>
        );
      })}
    </div>
  </div>
);
