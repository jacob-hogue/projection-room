import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import type { Topology } from 'topojson-specification';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../../../../src/lib/lineage';
import { MapStage } from '../../../../src/lib/mapstage';
import { PALETTES } from '../../../../src/lib/palette';
import { pulses } from '../../../../src/lib/pulses';
import { CALLOUTS, CAPTIONS, FILM_SECONDS, SOURCE, STAGE_H, STAGE_W, TITLE, URL_LINE, seg, yearAt } from './beats';
import { Dial } from './Dial';

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

interface Anchor {
  x: number;
  y: number;
}

export const Film: React.FC<Props> = ({ offsetSeconds = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = offsetSeconds + frame / fps;
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<MapStage | null>(null);
  const lineageRef = useRef<Lineage | null>(null);
  const usRef = useRef<Set<string>>(new Set());
  const orderRef = useRef<string[]>([]);
  const [handle] = useState(() => delayRender('dial-pulse data'));
  const [ready, setReady] = useState(false);
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [topo, lineageJson] = await Promise.all([
        fetch(staticFile('areas.topojson')).then((r) => r.json() as Promise<Topology>),
        fetch(staticFile('lineage.json')).then((r) => r.json()),
      ]);
      if (cancelled || !svgRef.current) return;
      const lineage = loadLineage(lineageJson);
      const stage = new MapStage(svgRef.current, topo, { width: STAGE_W, height: STAGE_H, palette: PALETTES.signature, lineage });
      await stage.warm();
      lineageRef.current = lineage;
      stageRef.current = stage;
      usRef.current = new Set(stage.territories().map((n) => originalOf(n, lineage)));
      stage.setYear(1947, 0);
      orderRef.current = [...stage.territories()].sort(
        (a, b) => pulses(stage.displayOf(a)) - pulses(stage.displayOf(b)) || Number(a) - Number(b),
      );
      setReady(true);
      continueRender(handle);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !ready) return;
    applyFrame(stage, t, orderRef.current);
    const next: Record<string, Anchor> = {};
    for (const c of CALLOUTS) {
      if (t >= c.from && t < c.to) {
        const a = stage.anchor(c.code);
        if (a) next[`${c.from}:${c.code}`] = a;
      }
    }
    setAnchors(next);
  }, [t, ready]);

  const caption = CAPTIONS.find((c) => t >= c.from && t < c.to);
  const captionAge = caption ? t - caption.from : 0;
  const captionOpacity = caption ? Math.min(1, captionAge / 0.4) * (caption.to - t < 0.4 ? (caption.to - t) / 0.4 : 1) : 0;
  const year = t >= 32.5 && t < 46 ? yearAt(t) : null;
  const count = year && lineageRef.current ? countFor(year, lineageRef.current, usRef.current) : null;
  const endCard = seg(t, 51.5, 52.5);
  const mapTop = 190;
  const mapLeft = (1920 - STAGE_W) / 2;

  return (
    <AbsoluteFill style={{ background: SURFACE, fontFamily: SANS, color: TEXT }}>
      <div style={{ position: 'absolute', left: 80, top: 54 }}>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{TITLE}</div>
        <div style={{ fontSize: 26, color: TEXT_2, marginTop: 12, maxWidth: 1500, opacity: captionOpacity, lineHeight: 1.3 }}>{caption?.text}</div>
      </div>

      <div style={{ position: 'absolute', left: mapLeft, top: mapTop, width: STAGE_W, height: STAGE_H, opacity: 1 - endCard * 0.85 }}>
        <svg ref={svgRef} width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ display: 'block', borderRadius: 16 }} />
        <svg
          width={STAGE_W}
          height={STAGE_H}
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          {CALLOUTS.map((c) => {
            const a = anchors[`${c.from}:${c.code}`];
            if (!a) return null;
            const p = seg(t, c.from, c.from + 0.35);
            const out = seg(t, c.to - 0.3, c.to);
            return (
              <line
                key={`${c.from}:${c.code}`}
                x1={a.x}
                y1={a.y}
                x2={a.x + c.dx * p}
                y2={a.y + c.dy * p}
                stroke={TEXT}
                strokeOpacity={0.8 * (1 - out)}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
        {CALLOUTS.map((c) => {
          const a = anchors[`${c.from}:${c.code}`];
          if (!a) return null;
          const p = seg(t, c.from + 0.3, c.from + 0.6);
          const out = seg(t, c.to - 0.3, c.to);
          const left = a.x + c.dx;
          const top = a.y + c.dy;
          return (
            <div
              key={`${c.from}:${c.code}`}
              style={{
                position: 'absolute',
                left: c.dx < 0 ? undefined : left + 12,
                right: c.dx < 0 ? STAGE_W - left + 12 : undefined,
                top,
                transform: `translateY(calc(-50% + ${(1 - p) * 10}px))`,
                opacity: p * (1 - out),
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(10, 12, 17, 0.88)',
                border: '1px solid rgba(255,255,255,0.14)',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>{c.title}</div>
              <div style={{ fontSize: 18, color: ACCENT, fontFamily: MONO, marginTop: 2 }}>{c.value}</div>
            </div>
          );
        })}
        {year !== null ? (
          <div style={{ position: 'absolute', right: 28, bottom: 24, textAlign: 'right', fontFamily: MONO }}>
            <div style={{ fontSize: 72, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{year}</div>
            <div style={{ fontSize: 20, color: TEXT_2, marginTop: 6 }}>{count} area codes</div>
          </div>
        ) : null}
        {t < 4.5 ? <Dial t={t} /> : null}
      </div>

      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 28, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 16, color: TEXT_2 }}>
        <span>{SOURCE}</span>
        <span style={{ color: ACCENT }}>{URL_LINE}</span>
      </div>

      {endCard > 0 ? (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: endCard }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.02em' }}>{TITLE}</div>
            <div style={{ fontSize: 26, color: TEXT_2, marginTop: 14 }}>Area codes, measured in the clicks it took to dial them</div>
            <div style={{ fontSize: 22, color: ACCENT, fontFamily: MONO, marginTop: 28 }}>{URL_LINE}</div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Drive the stage to the state for time t. Every call is idempotent for a given t. */
function applyFrame(stage: MapStage, t: number, order: string[]): void {
  if (t < 4.5) {
    stage.setMode('pulses', 0);
    stage.setLabels(false);
    stage.setBlank(true, 0);
    stage.cameraAt(null, 1);
    stage.dimAt(null, 1);
    return;
  }
  if (t < 9.5) {
    stage.setMode('pulses', 0);
    stage.setLabels(false);
    stage.setBlank(true, 0);
    stage.setYear(1947, 0);
    void stage.show(['212'], { step: 0, duration: 0 });
    stage.cameraAt('212', seg(t, 4.5, 6.6));
    stage.dimAt(['212'], seg(t, 5.6, 6.4));
    return;
  }
  if (t < 15) {
    stage.setMode('pulses', 0);
    stage.setLabels(false);
    stage.setBlank(true, 0);
    stage.setYear(1947, 0);
    stage.dimAt(null, 1);
    stage.cameraAt(null, seg(t, 9.5, 11));
    const shown = ['212'];
    if (t >= 10.6) shown.push('312');
    if (t >= 11.3) shown.push('213');
    if (t >= 12.0) shown.push('313');
    void stage.show(shown, { step: 0, duration: 0 });
    return;
  }
  if (t < 22) {
    stage.setMode('pulses', 0);
    stage.setYear(1947, 0);
    stage.cameraAt(null, 1);
    stage.dimAt(null, 1);
    stage.revealAt(order, seg(t, 15, 19.5));
    stage.setLabels(t >= 19.6);
    return;
  }
  if (t < 27.5) {
    stage.setMode('pulses', 0);
    stage.setYear(1947, 0);
    stage.setLabels(false);
    stage.revealAt(order, 1);
    stage.cameraAt(null, 1);
    stage.dimAt(['605', '803', '704'], seg(t, 22, 23));
    return;
  }
  if (t < 32.5) {
    stage.setYear(1947, 0);
    stage.setLabels(false);
    stage.revealAt(order, 1);
    stage.cameraAt(null, 1);
    stage.dimAt(null, 1);
    stage.setMode('middle', 0);
    return;
  }
  if (t < 46) {
    stage.setMode('pulses', 0);
    stage.setLabels(false);
    stage.revealAt(order, 1);
    stage.cameraAt(null, 1);
    stage.dimAt(null, 1);
    stage.setYear(yearAt(t), 0);
    return;
  }
  stage.setMode('pulses', 0);
  stage.setYear(2025, 0);
  stage.revealAt(order, 1);
  stage.cameraAt(null, 1);
  stage.setLabels(true);
  stage.dimAt(['713', '404', '214', '212'], seg(t, 46, 47));
}

function countFor(year: number, lineage: Lineage, us: Set<string>): number {
  let n = 0;
  for (const code of codesInEffect(year, lineage)) if (us.has(originalOf(code, lineage))) n++;
  return n;
}

export const filmSeconds = FILM_SECONDS;
