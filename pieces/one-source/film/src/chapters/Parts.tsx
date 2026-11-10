import { EASE } from '../beats';
import { Heading } from '../chrome';
import { MONO } from '../fonts';
import { enterAt, staggerAt } from '../frame';
import { rise } from '../parts';
import { C } from '../theme';

const PARTS = [
  {
    title: 'No single source of truth',
    body: 'Five copies of the parcel data, and none is clearly authoritative. When someone corrects a lot line in one system, the other four can still be wrong.',
    fix: 'Fix: one source of record',
  },
  {
    title: 'Updates overwrite the whole layer',
    body: 'In this scenario each refresh replaces the whole hosted layer, all 48,000 rows, to carry about 300 changes. Overwriting is the usual way to refresh a hosted layer in ArcGIS Online, and it fails when sync is turned on and grows storage with every run.',
    fix: 'Fix: update only what changed',
  },
  {
    title: 'Readers and editors share a layer',
    body: 'Applications that only need to view parcel data use the same layer that staff edit throughout the day. That creates unnecessary load and introduces risk for applications that should just be reading.',
    fix: 'Fix: separate read and write access',
  },
];

const W = 578;
const GAP = 29;
const TOP = 240;
const H = 520;

export const Parts: React.FC<{ local: number }> = ({ local }) => (
  <>
    <Heading text="Breaking the problem into three parts, each with a known fix" enter={enterAt(local, 0.2)} />
    {PARTS.map((p, i) => {
      const enter = staggerAt(local, 1.0, i, 1.2, EASE.state);
      const fix = staggerAt(local, 4.0, i, 1.2, EASE.state);
      return (
        <div
          key={p.title}
          style={{
            position: 'absolute',
            left: 64 + i * (W + GAP),
            top: TOP,
            width: W,
            height: H,
            boxSizing: 'border-box',
            padding: '32px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            borderRadius: 14,
            background: C.surface,
            border: `1px solid ${C.hairline}`,
            ...rise(enter),
          }}
        >
          <div style={{ width: 56, height: 56, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.raised, border: `1px solid ${C.hairline}`, fontFamily: MONO, fontSize: 22, color: C.secondary }}>
            0{i + 1}
          </div>
          <div style={{ fontSize: 38, lineHeight: '46px', fontWeight: 600 }}>{p.title}</div>
          <div style={{ fontSize: 23, lineHeight: '33px', color: C.secondary }}>{p.body}</div>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, ...rise(fix) }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: C.green }} />
            <span>{p.fix}</span>
          </div>
        </div>
      );
    })}
  </>
);
