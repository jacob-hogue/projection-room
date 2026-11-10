import { BYLINE, EASE, END_LINE, SOURCE, STACK_LINE, TITLE, URL_LINE } from '../beats';
import { MONO } from '../fonts';
import { enterAt } from '../frame';
import { rise } from '../parts';
import { C, LINE, TYPE } from '../theme';

export const End: React.FC<{ local: number }> = ({ local }) => (
  <div style={{ position: 'absolute', left: 64, top: 0, width: 1792, height: 1080, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, textAlign: 'center' }}>
    <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.green, ...rise(enterAt(local, 0.4, EASE.reveal)) }}>{TITLE}</div>
    <div style={{ maxWidth: 1300, fontSize: TYPE.display, lineHeight: `${LINE.display}px`, fontWeight: 600, letterSpacing: '-0.015em', ...rise(enterAt(local, 0.9, EASE.reveal)) }}>
      {END_LINE}
    </div>
    <div style={{ width: 96, height: 2, background: C.green, ...rise(enterAt(local, 1.6, EASE.reveal)) }} />
    <div style={{ fontSize: TYPE.caption, lineHeight: `${LINE.caption}px`, color: C.secondary, ...rise(enterAt(local, 2.0, EASE.reveal)) }}>{BYLINE}</div>
    <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: MONO, fontSize: 17, lineHeight: '26px', color: C.muted, ...rise(enterAt(local, 2.6, EASE.reveal)) }}>
      <div>{SOURCE}</div>
      <div>{STACK_LINE}</div>
      <div style={{ color: C.secondary }}>{URL_LINE}</div>
    </div>
  </div>
);
