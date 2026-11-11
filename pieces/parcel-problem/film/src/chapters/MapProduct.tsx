import { useLayoutEffect, useRef, useState } from 'react';
import type { Topology } from 'topojson-specification';
import { EASE, seg } from '../beats';
import type { Stats } from '../changes';
import { Heading } from '../chrome';
import { MONO } from '../fonts';
import { enterAt } from '../frame';
import { FRESH_LABELS, ParcelStage, YEAR_LABELS } from '../parcelstage';
import { Stat, eyebrow, fmt, rise } from '../parts';
import { C, RAMP } from '../theme';

export const MAP = { left: 64, top: 220, width: 1300, height: 616 } as const;
const RAIL = { left: 1436, top: 220, width: 420 } as const;

/** Chapter seconds: the question, then the towns answer it; hold; zoom; parcels; hold. */
export const T = { reveal: 3.0, revealEnd: 7.0, callout: 11.0, zoom: 20.0, zoomEnd: 23.0, parcels: 22.0, parcelsEnd: 28.0 } as const;

interface Props {
  local: number;
  towns: Topology | null;
  parcels: Topology | null;
  stats: Stats | null;
}

export const MapProduct: React.FC<Props> = ({ local, towns, parcels, stats }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [stage, setStage] = useState<ParcelStage | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!ref.current || stage || !towns || !parcels) return;
    setStage(new ParcelStage(ref.current, towns, parcels, { width: MAP.width, height: MAP.height, fill: 0.78 }));
  }, [towns, parcels, stage]);

  const zoom = EASE.inOut(seg(local, T.zoom, T.zoomEnd));
  const townReveal = seg(local, T.reveal, T.revealEnd);
  const parcelReveal = seg(local, T.parcels, T.parcelsEnd);
  const callout = Math.min(enterAt(local, T.callout, EASE.state), 1 - seg(local, T.zoom - 0.4, T.zoom + 0.4));

  useLayoutEffect(() => {
    if (!stage || !stats) return;
    stage.townFills(townReveal);
    stage.cameraAt(zoom);
    stage.townDim(zoom);
    stage.parcelFills(parcelReveal);
    stage.setTownOutline(stats.town.id, Math.max(callout * 0.9, zoom * 0.5 * (1 - parcelReveal)));
    const a = stage.anchor(stats.town.id);
    if (a && (!anchor || Math.abs(a.x - anchor.x) > 0.5 || Math.abs(a.y - anchor.y) > 0.5)) setAnchor(a);
  }, [stage, stats, townReveal, zoom, parcelReveal, callout, anchor]);

  const zoomed = zoom >= 0.5;
  const frameEnter = enterAt(local, 0.2, EASE.state);
  const t = stats?.town;
  // The heading asks the question the map answers; it changes with the camera.
  const headingText = zoomed ? `${t?.name ?? ''}, parcel by parcel` : 'Real data: one standardized parcel layer for 351 Massachusetts towns';
  const headingEnter = zoomed ? enterAt(local, T.zoom + 1.5, EASE.state) : Math.min(enterAt(local, 0.2, EASE.state), 1 - seg(local, T.zoom + 1.0, T.zoom + 1.5));

  return (
    <>
      <Heading text={headingText} enter={headingEnter} />
      <div style={{ position: 'absolute', left: 64, top: 168, fontSize: 22, lineHeight: '30px', color: C.secondary, ...rise(Math.min(enterAt(local, 0.6), 1 - seg(local, T.zoom + 1.0, T.zoom + 1.5))) }}>
        Published by MassGIS from what each town delivers to a shared standard. 2.56 million parcels; towns with edits since 2023 in green.
      </div>

      <div style={{ position: 'absolute', left: MAP.left, top: MAP.top, width: MAP.width, height: MAP.height, boxSizing: 'border-box', borderRadius: 12, background: '#080b10', border: `1px solid ${C.hairline}`, overflow: 'hidden', ...rise(frameEnter) }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(74,222,128,0.07) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <svg ref={ref} width={MAP.width} height={MAP.height} viewBox={`0 0 ${MAP.width} ${MAP.height}`} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden="true" />
        {anchor && callout > 0 ? (
          <div style={{ position: 'absolute', left: anchor.x + 14, top: anchor.y - 46, padding: '8px 12px', borderRadius: 6, background: 'rgba(11,15,20,0.9)', border: `1px solid ${C.hairline}`, fontFamily: MONO, fontSize: 14, letterSpacing: '0.06em', color: C.text, whiteSpace: 'nowrap', opacity: callout, transform: `translateY(${(1 - callout) * 8}px)` }}>
            {t?.name} · {t ? fmt(t.n) : ''} parcels
          </div>
        ) : null}
        <div style={{ position: 'absolute', right: 24, top: 24, padding: '8px 12px', borderRadius: 6, background: 'rgba(11,15,20,0.88)', border: `1px solid ${C.hairline}`, fontFamily: MONO, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.secondary }}>
          {zoomed ? t?.name : 'Massachusetts'} · {stats?.run}
        </div>
        <div style={{ position: 'absolute', left: 24, bottom: 24, display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px', borderRadius: 10, background: 'rgba(11,15,20,0.88)', border: `1px solid ${C.hairline}`, ...rise(enterAt(local, T.reveal + 0.4, EASE.state)) }}>
          <div style={{ ...eyebrow(C.secondary), fontSize: 13 }}>{zoomed ? 'Last edited' : 'Parcels edited since 2023'}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {RAMP.map((c) => (
              <div key={c} style={{ width: 52, height: 12, background: c, borderRadius: 2 }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 13, color: C.muted }}>
            <span>{zoomed ? YEAR_LABELS[0] : FRESH_LABELS[0]}</span>
            <span>{zoomed ? YEAR_LABELS[4] : FRESH_LABELS[4]}</span>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', left: RAIL.left, top: RAIL.top, width: RAIL.width, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ ...eyebrow(C.green), fontSize: 14, ...rise(enterAt(local, T.reveal, EASE.state)) }}>Real data</div>
        <Stat eyebrow="towns, one shared schema" value={stats?.towns ?? 0} enter={enterAt(local, T.reveal + 0.4, EASE.state)} size={56} />
        <Stat eyebrow="parcels" value={stats?.parcels ?? 0} enter={enterAt(local, T.reveal + 1.0, EASE.state)} size={56} />
        <Stat eyebrow="source of record" value={1} enter={enterAt(local, T.reveal + 1.6, EASE.state)} size={56} live />
        <div style={{ height: 1, background: C.hairline, ...rise(enterAt(local, T.parcels + 1.0, EASE.state)) }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...rise(enterAt(local, T.parcels + 1.2, EASE.state)) }}>
          <div style={eyebrow()}>{t?.name}</div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: C.text }}>{t ? fmt(t.n) : ''} parcels</div>
          <div style={{ fontFamily: MONO, fontSize: 22, color: C.green }}>{t ? fmt(t.since2023) : ''} edited since 2023</div>
          <div style={{ fontFamily: MONO, fontSize: 16, color: C.muted }}>edit history {t ? String(t.first).slice(0, 4) : ''} to {t ? String(t.last).slice(0, 4) : ''}</div>
        </div>
      </div>
    </>
  );
};
