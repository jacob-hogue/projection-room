/** Frame chrome shared by every chapter: the sheet, the header with its chapter rail, the caption. */
import { AbsoluteFill } from 'remotion';
import { CHAPTERS, EASE, PIECE_LABEL, captionAt, chapterAt } from './beats';
import { SANS, MONO } from './fonts';
import { enterAt } from './frame';
import { C, GRID, LINE, TYPE } from './theme';

export const sheetStyle: React.CSSProperties = {
  backgroundColor: C.ground,
  backgroundImage: 'radial-gradient(rgba(159,176,195,0.10) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  color: C.text,
  fontFamily: SANS,
};

export const Sheet: React.FC<{ children?: React.ReactNode }> = ({ children }) => <AbsoluteFill style={sheetStyle}>{children}</AbsoluteFill>;

export const mono: React.CSSProperties = { fontFamily: MONO };
export const label: React.CSSProperties = { fontFamily: MONO, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted };

/** Piece label left, chapter rail right. The rail moves 0.4 s ahead of the chapter dissolve. */
export const Header: React.FC<{ t: number }> = ({ t }) => {
  const active = chapterAt(t + 0.4);
  return (
    <>
      <div style={{ position: 'absolute', left: GRID.safe, top: GRID.header, fontFamily: MONO, fontSize: 16, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>
        {PIECE_LABEL}
      </div>
      <div style={{ position: 'absolute', right: GRID.safe, top: GRID.header - 4, display: 'flex', gap: 28, fontFamily: MONO, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {CHAPTERS.map((name, i) => {
          const on = i === active;
          return (
            <span key={name} style={{ color: on ? C.green : C.muted, borderBottom: `2px solid ${on ? C.green : 'transparent'}`, paddingBottom: 4, transition: 'none' }}>
              {name}
            </span>
          );
        })}
      </div>
    </>
  );
};

/** The current caption, settling 6 px and fading in over EASE.enter. */
export const Caption: React.FC<{ t: number }> = ({ t }) => {
  const c = captionAt(t);
  if (!c || !c.text) return null;
  const p = enterAt(t - c.from, 0, EASE.enter);
  // Four lines fit above the frame's edge; a long caption steps down one size to stay inside.
  const long = c.text.split(/\s+/).length > 64;
  return (
    <div
      style={{
        position: 'absolute',
        left: GRID.safe,
        top: GRID.caption,
        width: GRID.captionWidth,
        fontSize: long ? 27 : TYPE.caption,
        lineHeight: `${long ? 36 : LINE.caption}px`,
        opacity: p,
        transform: `translateY(${(1 - p) * 6}px)`,
      }}
    >
      {c.text}
    </div>
  );
};

/** A chapter heading at the grid's heading line. */
export const Heading: React.FC<{ text: string; enter: number }> = ({ text, enter }) => (
  <div style={{ position: 'absolute', left: GRID.safe, top: GRID.heading, fontSize: TYPE.heading, lineHeight: `${LINE.heading}px`, fontWeight: 600, opacity: enter, transform: `translateY(${(1 - enter) * 12}px)` }}>
    {text}
  </div>
);
