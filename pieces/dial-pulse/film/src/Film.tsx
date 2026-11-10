import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import type { Topology } from 'topojson-specification';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../../../../src/lib/lineage';
import { MapStage } from '../../../../src/lib/mapstage';
import { PALETTES, pulseColor } from '../../../../src/lib/palette';
import { pulses } from '../../../../src/lib/pulses';
import { BYLINE, CAPTIONS, EASE, FILM_SECONDS, INSET, MAP, RAIL, RUN, S, SOURCE, SUBTITLE, TITLE, URL_LINE, seg, yearAt } from './beats';
import { Dial } from './Dial';
import { applyFrame, frameAt, type Frame } from './frame';
import { Inset } from './Inset';
import { ClicksLegend, Counter, MiddleLegend, Rows, Stat } from './Rail';

// Only the weights the film uses; loading every variation can time out the first frame.
const { fontFamily: SANS } = loadSans('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });
const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });

const SURFACE = '#0f1117';
const TEXT = '#e8eaed';
const TEXT_2 = '#8b8fa3';
const ACCENT = '#4ade80';

interface Props {
  /** Seconds into the film this composition starts at (the loop starts mid-film). */
  offsetSeconds?: number;
}

interface Data {
  topo: Topology;
  states: Topology;
  lineage: Lineage;
}

export const Film: React.FC<Props> = ({ offsetSeconds = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = offsetSeconds + frame / fps;
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<MapStage | null>(null);
  const orderRef = useRef<string[]>([]);
  const usRef = useRef<Set<string>>(new Set());
  const [handle] = useState(() => delayRender('dial-pulse data'));
  const [data, setData] = useState<Data | null>(null);
  const [anchor212, setAnchor212] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [topo, states, lineageJson] = await Promise.all([
        fetch(staticFile('areas.topojson')).then((r) => r.json() as Promise<Topology>),
        fetch(staticFile('states.topojson')).then((r) => r.json() as Promise<Topology>),
        fetch(staticFile('lineage.json')).then((r) => r.json()),
      ]);
      if (cancelled || !svgRef.current) return;
      const lineage = loadLineage(lineageJson);
      const stage = new MapStage(svgRef.current, topo, { width: MAP.width, height: MAP.height, palette: PALETTES.signature, lineage, states, flashNew: false });
      await stage.warm();
      stageRef.current = stage;
      usRef.current = new Set(stage.territories().map((n) => originalOf(n, lineage)));
      stage.setYear(1947, 0);
      orderRef.current = [...stage.territories()].sort(
        (a, b) => pulses(stage.displayOf(a)) - pulses(stage.displayOf(b)) || Number(a) - Number(b),
      );
      setData({ topo, states, lineage });
      continueRender(handle);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const f: Frame = frameAt(t);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !data) return;
    applyFrame(stage, f, orderRef.current);
    const a = stage.anchor('212');
    const next = a ? { x: MAP.left + a.x, y: MAP.top + a.y } : null;
    // Keep the same object when nothing moved, or this effect would re-render forever.
    setAnchor212((prev) => (prev && next && prev.x === next.x && prev.y === next.y ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, data]);

  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to);
  const captionIn = caption ? EASE.out(seg(t, caption.from, caption.from + EASE.state)) : 0;
  const captionOut = caption ? 1 - seg(t, caption.to - EASE.enter, caption.to) : 0;
  const captionOpacity = captionIn * captionOut;
  const endCard = EASE.inOut(seg(t, S.end, S.end + 1.6));
  const yearF = yearAt(t);
  const y0 = Math.floor(yearF);
  const y1 = Math.min(2025, Math.ceil(yearF));
  const count = data ? Math.round(countFor(y0, data.lineage, usRef.current) + (countFor(y1, data.lineage, usRef.current) - countFor(y0, data.lineage, usRef.current)) * (yearF - y0)) : 0;
  const insetTop = RAIL.top + 300;
  const insetEnter = f.inset ? f.inset.opacity : 0;
  const lineDraw = f.inset && anchor212 ? EASE.out(seg(insetEnter, 0.3, 1)) : 0;

  return (
    <AbsoluteFill style={{ background: SURFACE, fontFamily: SANS, color: TEXT }}>
      {/* Wordmark and the one large caption, which settles upward as it arrives */}
      <div style={{ position: 'absolute', left: MAP.left, top: 40, fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', opacity: 1 - endCard }}>
        jacob<span style={{ color: ACCENT }}>.</span>hogue / <span style={{ color: ACCENT }}>projection room</span>
      </div>
      <div style={{ position: 'absolute', left: MAP.left, top: 82, width: 1760, fontSize: 30, lineHeight: 1.28, color: TEXT, opacity: captionOpacity, transform: `translateY(${(1 - captionIn) * 6}px)` }}>
        {caption?.text}
      </div>

      {/* The map */}
      <div style={{ position: 'absolute', left: MAP.left, top: MAP.top, width: MAP.width, height: MAP.height, opacity: 1 - endCard * 0.85 }}>
        <svg ref={svgRef} width={MAP.width} height={MAP.height} viewBox={`0 0 ${MAP.width} ${MAP.height}`} style={{ display: 'block', borderRadius: 16 }} />
        {t < S.newYork ? <Dial t={t} /> : null}
      </div>

      {/* The rail */}
      <div style={{ position: 'absolute', left: RAIL.left, top: RAIL.top, width: RAIL.width, height: RAIL.height, opacity: 1 - endCard }}>
        {railContent(t, yearF, count)}
        {data && f.inset ? (
          <div style={{ position: 'absolute', left: 0, top: insetTop - RAIL.top }}>
            <Inset topo={data.topo} states={data.states} lineage={data.lineage} frame={f} order={orderRef.current} enter={insetEnter} label={f.inset.label} />
          </div>
        ) : null}
      </div>

      {/* Locator line from the inset to Manhattan on the main map, drawing itself in */}
      {f.inset && anchor212 ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {(() => {
            const x1 = anchor212.x;
            const y1 = anchor212.y;
            const x2 = RAIL.left;
            const y2 = insetTop + INSET.height / 2;
            const len = Math.hypot(x2 - x1, y2 - y1);
            return (
              <>
                <circle cx={x1} cy={y1} r={5} fill="none" stroke={TEXT} strokeOpacity={0.8 * insetEnter} strokeWidth={1.5} />
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={TEXT} strokeOpacity={0.45 * insetEnter} strokeWidth={1.2} strokeDasharray={`${len}`} strokeDashoffset={len * (1 - lineDraw)} />
              </>
            );
          })()}
        </svg>
      ) : null}

      {endCard > 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: endCard }}>
          <div style={{ textAlign: 'center', maxWidth: 1400, transform: `translateY(${(1 - endCard) * 14}px)` }}>
            <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: '-0.02em' }}>{TITLE}</div>
            <div style={{ fontSize: 30, color: TEXT_2, marginTop: 16 }}>{SUBTITLE}</div>
            <div style={{ fontSize: 22, color: TEXT, marginTop: 40 }}>{BYLINE}</div>
            <div style={{ fontSize: 22, color: ACCENT, fontFamily: MONO, marginTop: 10 }}>{URL_LINE}</div>
          </div>
          <div style={{ position: 'absolute', bottom: 40, left: 80, right: 80, textAlign: 'center', fontFamily: MONO, fontSize: 16, color: TEXT_2 }}>{SOURCE}</div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** The rail's content for the current shot. Arrivals use EASE.enter; staggered rows 0.15 s apart. */
function railContent(t: number, yearF: number, count: number): React.ReactNode {
  const enterAt = (from: number) => EASE.out(seg(t, from, from + EASE.enter));
  const rowsAt = (froms: number[]) => froms.map((from) => enterAt(from));
  if (t < S.newYork) return null;
  if (t < S.cities) {
    return <Stat eyebrow="1947 · New York" code="212" number="5" unit="pulses" note="2 + 1 + 2. 7.9 million people in its territory in 1950." enter={enterAt(S.newYork + 2.0)} />;
  }
  if (t < S.contrast) {
    return (
      <Rows
        eyebrow="1947 · the major markets"
        rows={[
          { code: '213', name: 'Los Angeles', value: '6 pulses', color: pulseColor(PALETTES.signature, 6) },
          { code: '312', name: 'Chicago', value: '6 pulses', color: pulseColor(PALETTES.signature, 6) },
          { code: '313', name: 'Detroit', value: '7 pulses', color: pulseColor(PALETTES.signature, 7) },
        ]}
        enters={rowsAt([S.cities + 1.0, S.cities + 3.0, S.cities + 5.0])}
        enter={enterAt(S.cities + 0.8)}
      />
    );
  }
  if (t < S.middle) {
    const swap = S.contrast + 9.0;
    return (
      <>
        {t < swap ? (
          <Stat eyebrow="1947 · United States" code="" number="77" unit="area codes" note="From 5 pulses to 21" enter={EASE.out(seg(t, S.contrast + 4.8, S.contrast + 4.8 + EASE.state))} leave={1 - seg(t, swap - EASE.enter, swap)} />
        ) : (
          <Rows
            eyebrow="1947 · 21 pulses"
            rows={[
              { code: '605', name: 'South Dakota', sub: '651,000 people', value: '21', color: pulseColor(PALETTES.signature, 21) },
              { code: '704', name: 'North Carolina', sub: '4.1 million people', value: '21', color: pulseColor(PALETTES.signature, 21) },
            ]}
            enters={rowsAt([swap + 0.4, swap + 2.2])}
            enter={enterAt(swap + 0.2)}
          />
        )}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <ClicksLegend enter={EASE.out(seg(t, S.contrast + 4.8, S.contrast + 4.8 + EASE.reveal))} />
        </div>
      </>
    );
  }
  if (t < S.changes) {
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <MiddleLegend enter={EASE.out(seg(t, S.middle + 1.2, S.middle + 1.2 + EASE.state))} />
      </div>
    );
  }
  if (t < S.present) {
    let event: React.ReactNode = null;
    const eventStat = (eyebrow: string, code: string, note: string, from: number, to: number) => (
      <Stat eyebrow={eyebrow} code={code} number="" unit="" note={note} enter={enterAt(from + 0.2)} leave={1 - seg(t, to - EASE.enter, to)} />
    );
    if (t >= RUN.split1948 && t < RUN.runTo1992) event = eventStat('1948 · the first split', '219', "Cut out of Indiana's 317", RUN.split1948, RUN.runTo1992);
    else if (t >= RUN.hold1992 && t < RUN.runTo2007) event = eventStat('1992 · the first overlay', '917', "Added over Manhattan's 212. The boundary did not move.", RUN.hold1992, RUN.runTo2007);
    else if (t >= RUN.hold2007 && t < RUN.runTo2025) event = eventStat('2007 · the last split', '575', "Cut out of New Mexico's 505. Every code since has been an overlay.", RUN.hold2007, RUN.runTo2025);
    return (
      <>
        {event}
        <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <Counter year={Math.floor(yearF)} count={count} enter={enterAt(S.changes + 0.6)} />
        </div>
      </>
    );
  }
  if (t < S.conclusion) {
    return <Stat eyebrow="2025 · Houston" code="713" number="5" unit="codes" note="713, 281, 832, 346 and 621 share one territory" enter={enterAt(S.present + 2.0)} />;
  }
  return (
    <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
      <Counter year={2025} count={count} enter={1} />
    </div>
  );
}

function countFor(year: number, lineage: Lineage, us: Set<string>): number {
  let n = 0;
  for (const code of codesInEffect(year, lineage)) if (us.has(originalOf(code, lineage))) n++;
  return n;
}

export const filmSeconds = FILM_SECONDS;
