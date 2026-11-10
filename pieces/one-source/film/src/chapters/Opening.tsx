import { BYLINE, EASE, RULE, TITLE } from '../beats';
import { MONO } from '../fonts';
import { enterAt } from '../frame';
import { rise } from '../parts';
import { C, LINE, TYPE } from '../theme';

/** The title card: eyebrow, title, rule and byline settle in one after another. */
export const Opening: React.FC<{ local: number }> = ({ local }) => {
  const a = enterAt(local, 0.4, EASE.reveal);
  const b = enterAt(local, 1.0, EASE.reveal);
  const c = enterAt(local, 1.8, EASE.reveal);
  const d = enterAt(local, 2.6, EASE.reveal);
  return (
    <div style={{ position: 'absolute', left: 64, top: 0, width: 1792, height: 1080, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
      <div style={{ fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.green, ...rise(a) }}>A data film</div>
      <div style={{ fontSize: 112, lineHeight: '120px', fontWeight: 600, letterSpacing: '-0.02em', ...rise(b) }}>{TITLE}</div>
      <div style={{ maxWidth: 1000, fontSize: TYPE.caption, lineHeight: `${LINE.caption}px`, color: C.secondary, ...rise(c) }}>{RULE}</div>
      <div style={{ fontFamily: MONO, fontSize: 17, color: C.muted, ...rise(d) }}>{BYLINE}</div>
    </div>
  );
};
