import { EASE, seg } from '../beats';
import { Heading } from '../chrome';
import { MONO } from '../fonts';
import { enterAt, staggerAt } from '../frame';
import { eyebrow, fmt, rise } from '../parts';
import { C } from '../theme';

interface Office {
  name: string;
  /** What this user does with the parcels. */
  uses: string;
  field: string;
  count: number;
  note: string;
  failed?: boolean;
}

/** Example County is fictional; the caption says so. */
export const OFFICES: Office[] = [
  { name: 'Assessor', uses: 'values property', field: 'Parcel_ID', count: 48212, note: 'Updated by hand each night' },
  { name: 'Planning', uses: 'reviews permits', field: 'ParcelNumber', count: 48190, note: 'Copied over once a month' },
  { name: 'Public works', uses: 'maintains roads and pipes', field: 'PID', count: 47955, note: 'Last copied in 2024' },
  { name: 'Dispatch', uses: 'routes emergency calls', field: 'PARCEL_NO', count: 48201, note: 'Copied once a week' },
  { name: 'Open data portal', uses: 'publishes to the public', field: 'MapLot', count: 46880, note: 'Last overwrite failed', failed: true },
];

const CARD_W = 339;
const GAP = 24;
const TOP = 240;
const H = 380;
/** The drift highlight begins here, as the second caption arrives. */
const DRIFT_AT = 14.4;

export const Problem: React.FC<{ local: number }> = ({ local }) => (
  <>
    <Heading text="The problem: five copies of one parcel map" enter={enterAt(local, 0.2)} />
    <div style={{ position: 'absolute', left: 64, top: 168, fontSize: 22, lineHeight: '30px', color: C.secondary, ...rise(enterAt(local, 0.6)) }}>
      Example County. Five offices, five copies, five answers to the same question.
    </div>
    {OFFICES.map((o, i) => {
      const enter = staggerAt(local, 1.2, i, 0.6, EASE.state);
      const drift = EASE.inOut(seg(local, DRIFT_AT + i * 0.8, DRIFT_AT + i * 0.8 + EASE.state));
      const fieldColor = drift > 0.5 ? C.amber : C.text;
      return (
        <div
          key={o.name}
          style={{
            position: 'absolute',
            left: 64 + i * (CARD_W + GAP),
            top: TOP,
            width: CARD_W,
            height: H,
            boxSizing: 'border-box',
            padding: '26px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRadius: 12,
            background: C.surface,
            border: `1px dashed ${C.amber}`,
            boxShadow: `0 0 0 ${drift * 4}px rgba(227,165,61,${drift * 0.12})`,
            ...rise(enter),
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={eyebrow(C.amber)}>{o.name}</div>
            <div style={{ fontSize: 18, lineHeight: '24px', color: C.secondary }}>{o.uses}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 15, color: C.muted }}>key field</div>
            <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 500, color: fieldColor }}>{o.field}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 15, color: C.muted }}>parcels</div>
            <div style={{ fontSize: 48, lineHeight: '52px', fontWeight: 600 }}>{fmt(o.count * EASE.out(enter))}</div>
            <div style={{ fontSize: 17, lineHeight: '24px', color: o.failed ? C.amber : C.secondary }}>{o.note}</div>
          </div>
        </div>
      );
    })}
  </>
);
