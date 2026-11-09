import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import type { Topology } from 'topojson-specification';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../../../../src/lib/lineage';
import { MapStage, type Mode } from '../../../../src/lib/mapstage';
import { PALETTES, pulseColor } from '../../../../src/lib/palette';
import { pulses } from '../../../../src/lib/pulses';
import { BYLINE, CAPTIONS, FILM_SECONDS, INSET, MAP, RAIL, RUN, S, SOURCE, SUBTITLE, TITLE, URL_LINE, seg, yearAt } from './beats';
import { Dial } from './Dial';
import { Inset } from './Inset';
import { ClicksLegend, Counter, MiddleLegend, Rows, Stat } from './Rail';

const { fontFamily: SANS } = loadSans();
const { fontFamily: MONO } = loadMono();

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

/** What the main stage and the inset show at time t. */
interface Scene {
  mode: Mode;
  year: number;
  blank: boolean;
  shown: string[];
  reveal: number;
  labels: boolean;
  focus: string[] | null;
  dim: number;
  inset: { opacity: number; label: string } | null;
}

function sceneAt(t: number): Scene {
  const base: Scene = { mode: 'pulses', year: 1947, blank: false, shown: [], reveal: 1, labels: false, focus: null, dim: 1, inset: null };
  if (t < S.newYork) return { ...base, blank: true, reveal: 0 };
  if (t < S.cities) {
    return { ...base, blank: true, reveal: 0, shown: t >= S.newYork + 0.6 ? ['212'] : [], inset: { opacity: seg(t, S.newYork + 0.8, S.newYork + 1.6), label: 'New York, 1947' } };
  }
  if (t < S.original) {
    const shown = ['212'];
    if (t >= S.cities + 0.8) shown.push('312');
    if (t >= S.cities + 2.2) shown.push('213');
    if (t >= S.cities + 3.6) shown.push('313');
    return { ...base, blank: true, reveal: 0, shown };
  }
  if (t < S.exception) return { ...base, reveal: seg(t, S.original + 0.6, S.original + 5.6), labels: t >= S.original + 6 };
  if (t < S.middle) return { ...base, focus: ['605', '803', '704'], dim: seg(t, S.exception + 0.6, S.exception + 1.6) };
  if (t < S.changes) return { ...base, mode: t >= S.middle + 0.6 ? 'middle' : 'pulses' };
  if (t < S.present) {
    const year = yearAt(t);
    let focus: string[] | null = null;
    let dim = 0;
    if (t >= RUN.split1948 && t < RUN.runTo1992) {
      focus = ['219'];
      dim = Math.min(seg(t, RUN.split1948, RUN.split1948 + 0.5), 1 - seg(t, RUN.runTo1992 - 0.5, RUN.runTo1992));
    } else if (t >= RUN.hold1992 && t < RUN.runTo2007) {
      focus = ['212'];
      dim = Math.min(seg(t, RUN.hold1992, RUN.hold1992 + 0.5), 1 - seg(t, RUN.runTo2007 - 0.5, RUN.runTo2007));
    } else if (t >= RUN.hold2007 && t < RUN.runTo2025) {
      focus = ['575'];
      dim = Math.min(seg(t, RUN.hold2007, RUN.hold2007 + 0.5), 1 - seg(t, RUN.runTo2025 - 0.5, RUN.runTo2025));
    }
    const insetOn = t >= RUN.hold1992 - 0.4 && t < RUN.runTo2007 + 0.4;
    return {
      ...base,
      year,
      focus,
      dim,
      inset: insetOn ? { opacity: Math.min(seg(t, RUN.hold1992 - 0.4, RUN.hold1992 + 0.4), 1 - seg(t, RUN.runTo2007 - 0.2, RUN.runTo2007 + 0.4)), label: 'Manhattan, 1992' } : null,
    };
  }
  if (t < S.explanation) {
    return {
      ...base,
      year: 2025,
      focus: ['713', '404', '214', '212'],
      dim: seg(t, S.present + 0.6, S.present + 1.6),
      labels: true,
      inset: { opacity: seg(t, S.present + 1.2, S.present + 2), label: 'Manhattan, 2025' },
    };
  }
  return { ...base, year: 2025, labels: true, focus: null, dim: 1 };
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
      const stage = new MapStage(svgRef.current, topo, { width: MAP.width, height: MAP.height, palette: PALETTES.signature, lineage, states });
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

  const scene = sceneAt(t);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !data) return;
    stage.setMode(scene.mode, 0);
    stage.setYear(scene.year, 0);
    stage.cameraAt(null, 1);
    if (scene.blank) {
      stage.setBlank(true, 0);
      void stage.show(scene.shown, { step: 0, duration: 0 });
      stage.dimAt(null, 1);
    } else {
      stage.revealAt(orderRef.current, scene.reveal);
      // dimAt redraws every opacity; during a partial reveal it would hide what revealAt showed.
      if (scene.reveal >= 1) stage.dimAt(scene.focus, scene.dim);
    }
    stage.setLabels(scene.labels && scene.reveal >= 1);
    const a = stage.anchor('212');
    const next = a ? { x: MAP.left + a.x, y: MAP.top + a.y } : null;
    // Keep the same object when nothing moved, or this effect would re-render forever.
    setAnchor212((prev) => (prev && next && prev.x === next.x && prev.y === next.y ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, data]);

  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to);
  const captionAge = caption ? t - caption.from : 0;
  const captionOpacity = caption ? Math.min(1, captionAge / 0.5) * (caption.to - t < 0.4 ? (caption.to - t) / 0.4 : 1) : 0;
  const endCard = seg(t, S.end, S.end + 1.2);
  const count = data ? countFor(scene.year, data.lineage, usRef.current) : 0;
  const insetTop = RAIL.top + 300;

  return (
    <AbsoluteFill style={{ background: SURFACE, fontFamily: SANS, color: TEXT }}>
      {/* Wordmark and the one large caption */}
      <div style={{ position: 'absolute', left: MAP.left, top: 40, fontSize: 18, fontWeight: 700, letterSpacing: '0.02em', opacity: 1 - endCard }}>
        jacob<span style={{ color: ACCENT }}>.</span>hogue / <span style={{ color: ACCENT }}>projection room</span>
      </div>
      <div style={{ position: 'absolute', left: MAP.left, top: 84, width: 1760, fontSize: 36, lineHeight: 1.3, color: TEXT, opacity: captionOpacity }}>{caption?.text}</div>

      {/* The map */}
      <div style={{ position: 'absolute', left: MAP.left, top: MAP.top, width: MAP.width, height: MAP.height, opacity: 1 - endCard * 0.85 }}>
        <svg ref={svgRef} width={MAP.width} height={MAP.height} viewBox={`0 0 ${MAP.width} ${MAP.height}`} style={{ display: 'block', borderRadius: 16 }} />
        {t < S.newYork ? <Dial t={t} /> : null}
      </div>

      {/* The rail */}
      <div style={{ position: 'absolute', left: RAIL.left, top: RAIL.top, width: RAIL.width, height: RAIL.height, opacity: 1 - endCard }}>
        {railContent(t, scene, count)}
        {data && scene.inset ? (
          <div style={{ position: 'absolute', left: 0, top: insetTop - RAIL.top }}>
            <Inset
              topo={data.topo}
              states={data.states}
              lineage={data.lineage}
              year={scene.year}
              mode={scene.mode}
              focus={scene.focus}
              dim={scene.dim}
              blank={scene.blank}
              shown={scene.shown}
              opacity={scene.inset.opacity}
              label={scene.inset.label}
            />
          </div>
        ) : null}
      </div>

      {/* Locator line from the inset to Manhattan on the main map */}
      {scene.inset && anchor212 ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={RAIL.left} y1={insetTop + INSET.height / 2} x2={anchor212.x} y2={anchor212.y} stroke={TEXT} strokeOpacity={0.45 * scene.inset.opacity} strokeWidth={1.2} strokeDasharray="4 5" />
          <circle cx={anchor212.x} cy={anchor212.y} r={5} fill="none" stroke={TEXT} strokeOpacity={0.8 * scene.inset.opacity} strokeWidth={1.5} />
        </svg>
      ) : null}

      {endCard > 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: endCard }}>
          <div style={{ textAlign: 'center', maxWidth: 1400 }}>
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

/** The rail's content for the current shot. */
function railContent(t: number, scene: Scene, count: number): React.ReactNode {
  const fadeIn = (from: number, len = 0.6) => seg(t, from, from + len);
  if (t < S.newYork) return null;
  if (t < S.cities) return <Stat eyebrow="1947 · New York" code="212" number="5" unit="clicks" note="7.9 million people in its territory in 1950" opacity={fadeIn(S.newYork + 1.4)} />;
  if (t < S.original) {
    const shown = (t >= S.cities + 0.8 ? 1 : 0) + (t >= S.cities + 2.2 ? 1 : 0) + (t >= S.cities + 3.6 ? 1 : 0);
    return (
      <Rows
        eyebrow="1947 · the fast codes"
        rows={[
          { code: '312', name: 'Chicago', value: '6 clicks', color: pulseColor(PALETTES.signature, 6) },
          { code: '213', name: 'Los Angeles', value: '6 clicks', color: pulseColor(PALETTES.signature, 6) },
          { code: '313', name: 'Detroit', value: '7 clicks', color: pulseColor(PALETTES.signature, 7) },
        ]}
        shown={shown}
        opacity={fadeIn(S.cities + 0.6)}
      />
    );
  }
  if (t < S.exception) {
    return (
      <>
        <Stat eyebrow="1947 · United States" code="" number="77" unit="area codes" opacity={fadeIn(S.original + 5.8)} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <ClicksLegend opacity={fadeIn(S.original + 5.8)} />
        </div>
      </>
    );
  }
  if (t < S.middle) {
    const shown = (t >= S.exception + 1.2 ? 1 : 0) + (t >= S.exception + 2.6 ? 1 : 0) + (t >= S.exception + 4 ? 1 : 0);
    return (
      <>
        <Rows
          eyebrow="1947 · the slow codes"
          rows={[
            { code: '605', name: 'South Dakota', sub: '651,000 people', value: '21', color: pulseColor(PALETTES.signature, 21) },
            { code: '704', name: 'North Carolina', sub: '4.1 million people', value: '21', color: pulseColor(PALETTES.signature, 21) },
            { code: '803', name: 'South Carolina', sub: '2.1 million people', value: '21', color: pulseColor(PALETTES.signature, 21) },
          ]}
          shown={shown}
          opacity={fadeIn(S.exception + 1)}
        />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <ClicksLegend opacity={1} />
        </div>
      </>
    );
  }
  if (t < S.changes) {
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <MiddleLegend opacity={fadeIn(S.middle + 0.8)} />
      </div>
    );
  }
  if (t < S.present) {
    let event: React.ReactNode = null;
    if (t >= RUN.split1948 && t < RUN.runTo1992) event = <Stat eyebrow="1948 · the first split" code="219" number="" unit="" note="Cut out of Indiana's 317" opacity={fadeIn(RUN.split1948 + 0.2)} />;
    else if (t >= RUN.hold1992 && t < RUN.runTo2007) event = <Stat eyebrow="1992 · the first overlay" code="917" number="" unit="" note="Laid over Manhattan's 212. The boundary did not move." opacity={fadeIn(RUN.hold1992 + 0.2)} />;
    else if (t >= RUN.hold2007 && t < RUN.runTo2025) event = <Stat eyebrow="2007 · the last split" code="575" number="" unit="" note="Cut out of New Mexico's 505. Every code since has been an overlay." opacity={fadeIn(RUN.hold2007 + 0.2)} />;
    return (
      <>
        {event}
        <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <Counter year={scene.year} count={count} opacity={fadeIn(S.changes + 0.6)} />
        </div>
      </>
    );
  }
  if (t < S.explanation) return <Stat eyebrow="2025 · Houston" code="713" number="5" unit="codes" note="713, 281, 832, 346 and 621 share one territory" opacity={fadeIn(S.present + 1.4)} />;
  return (
    <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
      <Counter year={2025} count={count} opacity={1} />
    </div>
  );
}

function countFor(year: number, lineage: Lineage, us: Set<string>): number {
  let n = 0;
  for (const code of codesInEffect(year, lineage)) if (us.has(originalOf(code, lineage))) n++;
  return n;
}

export const filmSeconds = FILM_SECONDS;
