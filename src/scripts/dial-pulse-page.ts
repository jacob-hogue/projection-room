/**
 * Wires the dial-pulse page: data, the stage, the chapter beats, the year play, controls
 * and the hash state. Each chapter has a base state and an optional list of timed beats;
 * entering a chapter cancels the previous chapter's beats and runs its own.
 */
import { csvParse } from 'd3';
import type { Topology } from 'topojson-specification';
import { Callouts } from '../lib/callouts';
import { drawScatter } from '../lib/scatter';
import { dial, type DialHandles } from '../lib/dial';
import { readHash, writeHash, type HashState } from '../lib/hashstate';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../lib/lineage';
import { MapStage, YEAR_MAX, YEAR_MIN, type HoverInfo, type Mode } from '../lib/mapstage';
import { PALETTES, pulseColor, type PaletteName } from '../lib/palette';
import { pulses } from '../lib/pulses';

interface Beat {
  at: number;
  do: 'show' | 'zoom' | 'focus' | 'callout' | 'callouts' | 'reveal' | 'play';
  codes?: string[] | null;
  code?: string | null;
  step?: number;
  duration?: number;
  title?: string;
  value?: string;
  dx?: number;
  dy?: number;
  clear?: boolean;
  order?: 'pulses';
  from?: number;
  to?: number;
  seconds?: number;
}

interface ChapterState {
  year: number;
  mode: Mode;
  labels: boolean;
  blank: boolean;
  beats: Beat[];
  explore: boolean;
  widget: { type: 'dial'; number: string } | { type: 'ruler' } | { type: 'scatter' } | null;
}

const STAGE_W = 1200;
const STAGE_H = 760;
const T = { fill: 700, zoom: 1200, focus: 600, blank: 500 };

export async function mountDialPulse(): Promise<void> {
  const svgEl = document.getElementById('stage') as SVGSVGElement | null;
  const railEl = document.getElementById('rail');
  const frameEl = document.getElementById('callouts');
  if (!svgEl || !railEl || !frameEl) return;
  const svg: SVGSVGElement = svgEl;
  const rail: HTMLElement = railEl;
  const base = import.meta.env.BASE_URL;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = (n: number) => (reduced ? 0 : n);

  const [topo, lineageJson] = await Promise.all([
    fetch(`${base}dial-pulse/areas.topojson`).then((r) => r.json() as Promise<Topology>),
    fetch(`${base}dial-pulse/lineage.json`).then((r) => r.json()),
  ]);
  const lineage = loadLineage(lineageJson);
  const usOriginals = usOriginalsOf(topo, lineage);

  const initial = readHash(location.hash);
  const hasHash = (): boolean => location.hash.length > 1;
  const openedWithHash = hasHash();
  const stage = new MapStage(svg, topo, { width: STAGE_W, height: STAGE_H, palette: PALETTES[initial.palette], lineage });
  const callouts = new Callouts(frameEl, STAGE_W, STAGE_H, reduced);

  const controls = document.getElementById('controls') as HTMLFormElement;
  const yearInput = document.getElementById('year') as HTMLInputElement;
  const yearOut = document.getElementById('year-out') as HTMLOutputElement;
  const paletteSelect = document.getElementById('palette') as HTMLSelectElement;
  const labelsBox = document.getElementById('labels') as HTMLInputElement;
  const legendBox = document.getElementById('legend') as HTMLInputElement;
  const playButton = document.getElementById('play') as HTMLButtonElement;
  const readout = document.getElementById('readout') as HTMLOutputElement;
  const status = document.getElementById('stage-status') as HTMLElement;
  const badge = document.getElementById('year-badge') as HTMLElement;
  const badgeYear = badge.querySelector<HTMLElement>('[data-year]')!;
  const badgeCount = badge.querySelector<HTMLElement>('[data-count]')!;

  let state: HashState = { ...initial };
  let explore = false;
  let playing = false;
  let playFrame = 0;
  let run = 0; // increments on every chapter change; beats check it before acting

  function countFor(year: number): number {
    let n = 0;
    for (const code of codesInEffect(year, lineage)) if (usOriginals.has(originalOf(code, lineage))) n++;
    return n;
  }
  function setYear(year: number, duration: number, writeUrl: boolean): void {
    state.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    stage.setYear(state.year, duration);
    yearInput.value = String(state.year);
    yearOut.value = String(state.year);
    const count = countFor(state.year);
    status.textContent = `${state.year}: ${count} area codes in the lower 48`;
    badgeYear.textContent = String(state.year);
    badgeCount.textContent = `${count} codes`;
    if (writeUrl) writeUrl_();
  }
  function setMode(mode: Mode, duration: number, writeUrl: boolean): void {
    state.mode = mode;
    stage.setMode(mode, duration);
    const radio = controls.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    if (writeUrl) writeUrl_();
  }
  function setPalette(name: PaletteName, writeUrl: boolean): void {
    state.palette = name;
    stage.setPalette(PALETTES[name], ms(T.fill));
    paletteSelect.value = name;
    if (writeUrl) writeUrl_();
  }
  function setLabels(on: boolean): void {
    stage.setLabels(on);
    svg.dataset.labels = String(on);
    labelsBox.checked = on;
  }
  function setLegend(on: boolean): void {
    stage.setLegend(on);
    legendBox.checked = on;
  }
  function setExplore(on: boolean): void {
    explore = on;
    svg.dataset.explore = String(on);
    rail.dataset.explore = String(on);
    controls.hidden = !on;
    badge.hidden = true;
    // The legend belongs to explore; chapters carry their own meaning.
    stage.setLegend(on && legendBox.checked);
  }
  function writeUrl_(): void {
    if (!explore) return;
    history.replaceState(null, '', writeHash(state));
  }

  // Year play: one rAF loop mapped to time, so it can be paused and resumed.
  function stopPlay(): void {
    playing = false;
    cancelAnimationFrame(playFrame);
    playButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = 'Play';
  }
  function startPlay(from: number, to: number, seconds: number, counter: HTMLElement | null, onDone?: () => void): void {
    stopPlay();
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    playButton.textContent = 'Pause';
    const start = performance.now();
    const span = to - from;
    const stepMs = (seconds * 1000) / Math.max(1, span);
    const tick = (now: number): void => {
      if (!playing) return;
      const t = Math.min(1, (now - start) / (seconds * 1000));
      const year = Math.round(from + t * span);
      if (year !== state.year) {
        setYear(year, Math.min(400, stepMs * 1.5), false);
        if (counter) counter.textContent = `${year}: ${countFor(year)} codes`;
      }
      if (t < 1) playFrame = requestAnimationFrame(tick);
      else {
        stopPlay();
        onDone?.();
      }
    };
    playFrame = requestAnimationFrame(tick);
  }

  // Chapters. -----------------------------------------------------------------------------
  const chapters = [...document.querySelectorAll<HTMLElement>('.chapter')];
  let dialAbort: AbortController | null = null;

  function chapterState(el: HTMLElement): ChapterState {
    return {
      year: Number(el.dataset.year),
      mode: el.dataset.mode as Mode,
      labels: el.dataset.labels === 'true',
      blank: el.dataset.blank === 'true',
      beats: el.dataset.beats ? (JSON.parse(el.dataset.beats) as Beat[]) : [],
      explore: el.dataset.explore === 'true',
      widget: el.dataset.widget ? JSON.parse(el.dataset.widget) : null,
    };
  }

  function revealOrder(kind: 'pulses' | undefined): string[] {
    const territories = stage.territories();
    if (kind === 'pulses') {
      return [...territories].sort((a, b) => pulses(stage.displayOf(a)) - pulses(stage.displayOf(b)) || Number(a) - Number(b));
    }
    return territories;
  }

  function runBeat(beat: Beat, el: HTMLElement): void {
    switch (beat.do) {
      case 'show':
        void stage.show(beat.codes ?? [], { step: ms(beat.step ?? 0), duration: ms(beat.duration ?? T.fill) });
        break;
      case 'zoom':
        stage.zoomTo(beat.code ?? null, ms(beat.duration ?? T.zoom));
        break;
      case 'focus':
        stage.focus(beat.codes ?? null, ms(beat.duration ?? T.focus));
        break;
      case 'callouts':
        if (beat.clear) callouts.clear();
        break;
      case 'callout': {
        const code = beat.code ?? '';
        const a = stage.anchor(code);
        if (!a) break;
        callouts.show({ id: `${el.id}:${code}`, x: a.x, y: a.y, dx: beat.dx ?? 60, dy: beat.dy ?? -60, title: beat.title ?? '', value: beat.value ?? '' });
        break;
      }
      case 'reveal':
        void stage.reveal(revealOrder(beat.order), { step: ms(beat.step ?? 30), duration: ms(beat.duration ?? 500) });
        break;
      case 'play': {
        const counter = el.querySelector<HTMLElement>('[data-counter]');
        const from = beat.from ?? YEAR_MIN;
        const to = beat.to ?? YEAR_MAX;
        badge.hidden = false;
        if (reduced) {
          setYear(to, 0, false);
          if (counter) counter.textContent = `${to}: ${countFor(to)} codes`;
        } else {
          setYear(from, 0, false);
          startPlay(from, to, beat.seconds ?? 10, counter);
        }
        break;
      }
    }
  }

  function applyChapter(el: HTMLElement): void {
    const s = chapterState(el);
    const myRun = ++run;
    chapters.forEach((c) => c.classList.toggle('is-active', c === el));
    dialAbort?.abort();
    dialAbort = null;
    stopPlay();
    callouts.clear();
    badge.hidden = true;

    if (s.explore) {
      if (explore) return;
      setExplore(true);
      stage.focus(null, ms(T.focus));
      stage.zoomTo(null, ms(T.zoom));
      if (!hasHash()) {
        setMode(s.mode, ms(T.fill), false);
        setYear(s.year, ms(T.fill), false);
      }
      if (stage.state().year !== state.year) setYear(state.year, 0, false);
      stage.setBlank(false, 0);
      setLabels(s.labels);
      writeUrl_();
      return;
    }
    setExplore(false);

    const beatKinds = new Set(s.beats.map((b) => b.do));
    // Base state first, each change as a transition.
    if (!beatKinds.has('zoom') && stage.state().zoom !== 1) stage.zoomTo(null, ms(T.zoom));
    if (!beatKinds.has('focus')) stage.focus(null, ms(T.focus));
    setMode(s.mode, ms(T.fill), false);
    setLabels(s.labels);
    if (s.blank) {
      if (svg.dataset.blank !== 'true') stage.setBlank(true, ms(T.blank));
      else stage.setBlank(true, 0);
    } else if (svg.dataset.blank === 'true' && !beatKinds.has('reveal') && !beatKinds.has('show')) {
      stage.setBlank(false, ms(T.blank));
    }
    if (!beatKinds.has('play')) setYear(s.year, ms(T.fill), false);

    // Widgets.
    if (s.widget?.type === 'scatter') {
      const host = el.querySelector<HTMLElement>('[data-scatter]');
      if (host && !host.dataset.drawn) {
        host.dataset.drawn = 'true';
        void fetch(`${base}dial-pulse/population_1950.csv`)
          .then((r) => r.text())
          .then((text) => {
            const rows = csvParse(text, (d) => ({ code: String(d.code), population_1950: Number(d.population_1950) }));
            drawScatter(host, rows, (clicks) => pulseColor(PALETTES[state.palette], clicks), reduced);
          })
          .catch(() => {
            delete host.dataset.drawn;
          });
      }
    }
    if (s.widget?.type === 'dial') {
      const wrap = el.querySelector<HTMLElement>('.dial-wrap');
      const plate = wrap?.querySelector<SVGGElement>('.dial-plate');
      const clicks = wrap?.querySelector<HTMLElement>('.dial-clicks');
      if (wrap && plate && clicks) {
        dialAbort = new AbortController();
        const parts: DialHandles = { plate, clicks, readout: wrap.querySelector<HTMLElement>('.dial-readout') };
        void dial(parts, s.widget.number, reduced, dialAbort.signal);
      }
    }

    // Beats, in time, unless the chapter changed meanwhile.
    for (const beat of s.beats) {
      const delay = reduced ? 0 : beat.at;
      setTimeout(() => {
        if (run !== myRun) return;
        runBeat(beat, el);
      }, delay);
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) applyChapter(e.target as HTMLElement);
    },
    { threshold: 0.6 },
  );
  chapters.forEach((c) => observer.observe(c));

  // Controls. -----------------------------------------------------------------------------
  paletteSelect.addEventListener('change', () => setPalette(paletteSelect.value as PaletteName, true));
  controls.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => r.checked && setMode(r.value as Mode, ms(T.fill), true)),
  );
  yearInput.addEventListener('input', () => {
    stopPlay();
    setYear(Number(yearInput.value), ms(250), true);
  });
  labelsBox.addEventListener('change', () => setLabels(labelsBox.checked));
  legendBox.addEventListener('change', () => setLegend(legendBox.checked));
  playButton.addEventListener('click', () => {
    if (playing) stopPlay();
    else {
      const from = state.year >= YEAR_MAX ? YEAR_MIN : state.year;
      startPlay(from, YEAR_MAX, ((YEAR_MAX - from) / (YEAR_MAX - YEAR_MIN)) * 20, null, () => writeUrl_());
    }
  });
  document.getElementById('download')?.addEventListener('click', () => {
    const blob = new Blob([stage.toSVG()], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dial-pulse-${state.year}-${state.mode}-${state.palette}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const copyButton = document.getElementById('copy') as HTMLButtonElement;
  copyButton.addEventListener('click', async () => {
    writeUrl_();
    try {
      await navigator.clipboard.writeText(location.href);
      copyButton.textContent = 'Copied';
      setTimeout(() => (copyButton.textContent = 'Copy link'), 1500);
    } catch {
      copyButton.textContent = location.href;
    }
  });
  stage.onHover((info: HoverInfo | null) => {
    if (!info) {
      readout.value = 'Hover a territory for its codes.';
      return;
    }
    const first = lineage.codes[info.codes[0]];
    const others = info.codes.slice(1);
    const parts = [
      `${info.codes[0]} since ${first.year}`,
      `${info.pulses} clicks`,
      info.original === info.codes[0] ? 'an original 1947 code' : `from ${info.original} in 1947`,
    ];
    if (others.length) parts.push(`also ${others.join(', ')}`);
    readout.value = parts.join(' · ');
  });

  // Initial state: the hash wins if present, otherwise the first chapter's state.
  setPalette(initial.palette, false);
  setMode(initial.mode, 0, false);
  setYear(initial.year, 0, false);
  setLabels(false);
  stage.setBlank(true, 0);
  if (openedWithHash) {
    const last = chapters[chapters.length - 1];
    last?.scrollIntoView({ block: 'start' });
  }
}

function usOriginalsOf(topo: Topology, lineage: Lineage): Set<string> {
  const object = topo.objects.areas as { geometries: { properties?: { npa?: string | number } }[] };
  const out = new Set<string>();
  for (const g of object.geometries) {
    const npa = String(g.properties?.npa ?? '').padStart(3, '0');
    if (npa in lineage.codes) out.add(originalOf(npa, lineage));
  }
  return out;
}
