import { EASE, seg } from '../beats';
import { Heading, label } from '../chrome';
import { BAND, NODES, edges, type Node } from '../diagram';
import { MONO } from '../fonts';
import { enterAt } from '../frame';
import { Arrow, NodeCard, eyebrow, rise } from '../parts';
import { C } from '../theme';

/** When each node arrives, in chapter seconds. */
const NODE_AT: Record<string, number> = {
  assessor: 1.0,
  field: 1.4,
  planning: 1.8,
  service: 2.8,
  source: 4.4,
  detect: 7.8,
  validate: 8.8,
  publish: 9.8,
  log: 10.7,
  hosted: 12.4,
  parquet: 12.7,
  pmtiles: 13.0,
  readers: 15.8,
};

/** When each draw order starts; segments sharing an order stagger by 0.3 s. */
const ORDER_AT: Record<number, number> = { 0: 2.0, 1: 2.3, 2: 2.5, 3: 4.0, 4: 7.4, 5: 8.4, 6: 9.4, 7: 10.4, 8: 11.4, 9: 12.0, 10: 14.4, 11: 15.3 };
const BAND_AT = 6.9;

const SEGS = edges();

const body = (n: Node): React.ReactNode => {
  switch (n.id) {
    case 'assessor':
      return <span><span style={eyebrow()}>assessor</span><br />desktop GIS</span>;
    case 'field':
      return <span><span style={eyebrow()}>field crews</span><br />Field Maps, offline</span>;
    case 'planning':
      return <span><span style={eyebrow()}>planning</span><br />web editor</span>;
    case 'service':
      return (
        <span style={{ fontSize: 15, lineHeight: '22px' }}>
          <span style={{ ...eyebrow(), fontSize: 12 }}>one editing service</span>
          <br />
          <b style={{ fontSize: 20, lineHeight: '28px', fontWeight: 600 }}>On the source</b>
          <br />
          <span style={{ color: C.secondary }}>editor tracking · offline sync · branch versions for review</span>
        </span>
      );
    case 'source':
      return (
        <span style={{ lineHeight: '26px' }}>
          <span style={{ ...eyebrow(C.green), fontSize: 14 }}>source of record</span>
          <br />
          <b style={{ fontSize: 36, lineHeight: '48px', fontWeight: 600 }}>Parcels</b>
          <br />
          <span style={{ color: C.secondary }}>PostGIS · GlobalIDs</span>
        </span>
      );
    case 'detect':
      return <span><span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.12em', color: C.green }}>01</span><br /><b style={{ fontSize: 20, fontWeight: 600 }}>Detect changes</b><br /><span style={{ fontSize: 15, color: C.secondary }}>find records edited since the last run</span></span>;
    case 'validate':
      return <span><span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.12em', color: C.green }}>02</span><br /><b style={{ fontSize: 20, fontWeight: 600 }}>Validate</b><br /><span style={{ fontSize: 15, color: C.secondary }}>check counts, geometry, and schema</span></span>;
    case 'publish':
      return <span><span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: '0.12em', color: C.green }}>03</span><br /><b style={{ fontSize: 20, fontWeight: 600 }}>Publish</b><br /><span style={{ fontSize: 15, color: C.secondary }}>apply edits and write updated files</span></span>;
    case 'log':
      return <span style={{ fontFamily: MONO, fontSize: 15, color: C.secondary }}>Run log · Manifest</span>;
    case 'hosted':
      return <span style={{ fontSize: 16, lineHeight: '20px' }}><b style={{ fontWeight: 600 }}>Hosted feature layer</b><br /><span style={{ fontSize: 13, lineHeight: '17px', color: C.secondary }}>for ArcGIS Online maps; edits, not overwrites</span></span>;
    case 'parquet':
      return <span style={{ fontSize: 16, lineHeight: '20px' }}><b style={{ fontWeight: 600 }}>GeoParquet</b><br /><span style={{ fontSize: 13, lineHeight: '17px', color: C.secondary }}>versioned file, for analysis</span></span>;
    case 'pmtiles':
      return <span style={{ fontSize: 16, lineHeight: '20px' }}><b style={{ fontWeight: 600 }}>PMTiles</b><br /><span style={{ fontSize: 13, lineHeight: '17px', color: C.secondary }}>static tiles, for open-source web maps</span></span>;
    case 'readers':
      return (
        <span style={{ fontSize: 20, lineHeight: '26px' }}>
          <span style={eyebrow()}>reads</span>&nbsp;&nbsp; Every web map, portal and application reads from here. Nobody keeps a copy.
        </span>
      );
    default:
      return null;
  }
};

export const Architecture: React.FC<{ local: number }> = ({ local }) => {
  const band = enterAt(local, BAND_AT, EASE.state);
  const counts: Record<number, number> = {};
  return (
    <>
      <Heading text="The solution: one source of record, published nightly" enter={enterAt(local, 0.2)} />
      <div style={{ position: 'absolute', left: BAND.x, top: BAND.y, width: BAND.w, height: BAND.h, boxSizing: 'border-box', border: `1px solid ${C.hairline}`, borderRadius: 14, background: 'rgba(17,24,33,0.7)', opacity: band }} />
      <div style={{ position: 'absolute', left: BAND.x + 16, top: BAND.y + 12, ...label, fontSize: 13, opacity: band }}>Nightly update · 02:00</div>
      {SEGS.map((s, i) => {
        const k = counts[s.order] ?? 0;
        counts[s.order] = k + 1;
        const at = ORDER_AT[s.order] + k * 0.3;
        return <Arrow key={i} seg={s} draw={EASE.out(seg(local, at, at + EASE.state))} />;
      })}
      {NODES.map((n) => {
        const live = n.kind === 'source';
        const enter = enterAt(local, NODE_AT[n.id], live ? EASE.reveal : EASE.state);
        // One pulse of the glow as the source settles, never looping.
        const pulse = live ? Math.sin(Math.PI * seg(local, NODE_AT.source + 0.6, NODE_AT.source + 2.0)) : 0;
        return (
          <NodeCard key={n.id} node={n} enter={enter} live={live} pulse={pulse}>
            {body(n)}
          </NodeCard>
        );
      })}
      <div style={{ position: 'absolute', left: 64, top: 820, ...rise(0) }} />
    </>
  );
};
