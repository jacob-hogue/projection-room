import { BYLINE, EASE, END_LINE, SOURCE, STACK_LINE, TITLE, URL_LINE } from '../beats';
import { MONO } from '../fonts';
import { enterAt } from '../frame';
import { rise } from '../parts';
import { C } from '../theme';

/** The end card: the closing line and the credits. */
export const End: React.FC<{ local: number }> = ({ local }) => (
  <div style={{ position: 'absolute', left: 64, top: 0, width: 1792, height: 1080, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
    <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.green, ...rise(enterAt(local, 0.4, EASE.reveal)) }}>{TITLE}</div>
    <div style={{ maxWidth: 1400, fontSize: 64, lineHeight: '74px', fontWeight: 600, letterSpacing: '-0.015em', ...rise(enterAt(local, 0.9, EASE.reveal)) }}>{END_LINE}</div>
    <div style={{ width: 96, height: 2, background: C.green, ...rise(enterAt(local, 1.6, EASE.reveal)) }} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: MONO, fontSize: 17, lineHeight: '26px', color: C.muted, ...rise(enterAt(local, 2.0, EASE.reveal)) }}>
      <div style={{ color: C.secondary, fontFamily: 'inherit', fontSize: 22 }}>{BYLINE}</div>
      <div>{SOURCE}</div>
      <div>{STACK_LINE}</div>
      <div style={{ color: C.secondary }}>{URL_LINE}</div>
    </div>
  </div>
);
