import { BYLINE, EASE, END_LINE, SOURCE, STACK_LINE, SUMMARY, URL_LINE } from '../beats';
import { MONO } from '../fonts';
import { enterAt, staggerAt } from '../frame';
import { rise } from '../parts';
import { C } from '../theme';

/** The end card: problem, solution and result in three lines, then the closing line and credits. */
export const End: React.FC<{ local: number }> = ({ local }) => (
  <div style={{ position: 'absolute', left: 64, top: 0, width: 1792, height: 1080, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 40 }}>
    <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.hairline}` }}>
      {SUMMARY.map((row, i) => {
        const isResult = row.label === 'Result';
        return (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32, alignItems: 'baseline', padding: '24px 0', borderBottom: `1px solid ${C.hairline}`, ...rise(staggerAt(local, 0.4, i, 0.9, EASE.reveal)) }}>
            <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: '0.12em', textTransform: 'uppercase', color: isResult ? C.green : row.label === 'Problem' ? C.amber : C.secondary }}>{row.label}</div>
            <div style={{ fontSize: 34, lineHeight: '46px', fontWeight: isResult ? 500 : 400 }}>{row.text}</div>
          </div>
        );
      })}
    </div>
    <div style={{ maxWidth: 1400, fontSize: 48, lineHeight: '58px', fontWeight: 600, letterSpacing: '-0.01em', ...rise(enterAt(local, 3.4, EASE.reveal)) }}>{END_LINE}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: MONO, fontSize: 17, lineHeight: '26px', color: C.muted, ...rise(enterAt(local, 4.2, EASE.reveal)) }}>
      <div style={{ color: C.secondary }}>{BYLINE}</div>
      <div>{SOURCE}</div>
      <div>{STACK_LINE}</div>
      <div style={{ color: C.secondary }}>{URL_LINE}</div>
    </div>
  </div>
);
