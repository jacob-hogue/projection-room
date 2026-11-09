/**
 * Wires the dial-pulse page: data, the stage, the story stepper, the year play, controls
 * and the hash state. Each step has a base state and an optional list of timed beats.
 * Entering a step cancels the previous step's beats; if they had not finished, the previous
 * step is settled to its complete state first, so nothing is ever left half drawn.
 */
import { csvParse } from 'd3';
import type { Topology } from 'topojson-specification';
import { Callouts } from '../lib/callouts';
import { dial, type DialHandles } from '../lib/dial';
import { readHash, writeHash, type HashState } from '../lib/hashstate';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../lib/lineage';
import { MapStage, YEAR_MAX, YEAR_MIN, type HoverInfo, type Mode } from '../lib/mapstage';
import { PALETTES, pulseColor, type PaletteName } from '../lib/palette';
import { pulses } from '../lib/pulses';
import { drawScatter } from '../lib/scatter';

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

interface StepState {
  year: number;
  mode: Mode;
  labels: boolean;
  blank: boolean;
  beats: Beat[];
  hold: number;
  explore: boolean;
  widget: { type: 'dial'; number: string } | { type: 'ruler' } | { type: 'scatter' } | null;
}

const STAGE_W = 1200;
const STAGE_H = 760;
const T = { fill: 700, zoom: 1200, focus: 600, blank: 500 };
const DEFAULT_HOLD = 5000;

export async function mountDialPulse(): Promise<void> {
  document.documentElement.classList.add('js');
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
  void stage.warm();

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
  const prevButton = document.getElementById('step-prev') as HTMLButtonElement;
  const nextButton = document.getElementById('step-next') as HTMLButtonElement;
  const storyButton = document.getElementById('step-play') as HTMLButtonElement;
  const stepCount = document.getElementById('step-count') as HTMLElement;

  let state: HashState = { ...initial };
  let explore = false;
  let playing = false;
  let playFrame = 0;

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

  // Story steps. --------------------------------------------------------------------------
  const chapters = [...document.querySelectorAll<HTMLElement>('.chapter')];
  let current = -1;
  let run = 0;
  let pending = 0; // timers of the current step still to fire
  let storyPlaying = false;
  let storyTimer = 0;
  let dialAbort: AbortController | null = null;

  function stepState(el: HTMLElement): StepState {
    return {
      year: Number(el.dataset.year),
      mode: el.dataset.mode as Mode,
      labels: el.dataset.labels === 'true',
      blank: el.dataset.blank === 'true',
      beats: el.dataset.beats ? (JSON.parse(el.dataset.beats) as Beat[]) : [],
      hold: el.dataset.hold ? Number(el.dataset.hold) : DEFAULT_HOLD,
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

  /** Total milliseconds a step's beats take, for "play the story". */
  function beatsLength(s: StepState): number {
    let end = 0;
    for (const b of s.beats) {
      const length = b.do === 'play' ? (b.seconds ?? 10) * 1000 : b.do === 'reveal' ? 236 * (b.step ?? 30) + (b.duration ?? 500) : (b.duration ?? T.fill);
      end = Math.max(end, b.at + length);
    }
    if (s.widget?.type === 'dial') end = Math.max(end, 6500);
    return end;
  }

  function goTo(index: number): void {
    const next = Math.min(chapters.length - 1, Math.max(0, index));
    if (next === current) return;
    const prevEl = chapters[current];
    const el = chapters[next];
    const s = stepState(el);
    const myRun = ++run;

    // Leave the previous step on a complete state.
    dialAbort?.abort();
    dialAbort = null;
    stopPlay();
    clearTimeout(storyTimer);
    callouts.clear();
    badge.hidden = true;
    if (prevEl && pending > 0) {
      const p = stepState(prevEl);
      if (!p.explore) stage.settle({ year: p.year, mode: p.mode, labels: p.labels, blank: p.blank });
    }
    pending = 0;

    current = next;
    chapters.forEach((c, i) => {
      c.classList.toggle('is-active', i === next);
      const head = c.querySelector<HTMLButtonElement>('.chapter-head');
      if (head) {
        if (i === next) head.setAttribute('aria-current', 'step');
        else head.removeAttribute('aria-current');
      }
    });
    stepCount.textContent = `${next + 1} / ${chapters.length}`;
    prevButton.disabled = next === 0;
    nextButton.disabled = next === chapters.length - 1;
    el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });

    if (s.explore) {
      setExplore(true);
      stage.focus(null, ms(T.focus));
      stage.zoomTo(null, ms(T.zoom));
      if (!hasHash()) {
        setMode(s.mode, ms(T.fill), false);
        setYear(s.year, ms(T.fill), false);
      } else {
        setYear(state.year, 0, false);
      }
      stage.setBlank(false, ms(T.blank));
      setLabels(s.labels);
      stopStory();
      writeUrl_();
      return;
    }
    if (explore) setExplore(false);

    const kinds = new Set(s.beats.map((b) => b.do));
    if (!kinds.has('zoom') && stage.state().zoom !== 1) stage.zoomTo(null, ms(T.zoom));
    if (!kinds.has('focus')) stage.focus(null, ms(T.focus));
    setMode(s.mode, ms(T.fill), false);
    setLabels(s.labels);
    if (s.blank) {
      stage.setBlank(true, svg.dataset.blank === 'true' ? 0 : ms(T.blank));
    } else if (svg.dataset.blank === 'true' && !kinds.has('reveal') && !kinds.has('show')) {
      stage.setBlank(false, ms(T.blank));
    }
    if (!kinds.has('play')) setYear(s.year, ms(T.fill), false);

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

    for (const beat of s.beats) {
      pending++;
      setTimeout(() => {
        if (run !== myRun) return;
        pending--;
        runBeat(beat, el);
      }, reduced ? 0 : beat.at);
    }
    if (storyPlaying) {
      const wait = reduced ? 1500 : beatsLength(s) + s.hold;
      storyTimer = window.setTimeout(() => {
        if (run === myRun && storyPlaying) goTo(current + 1);
      }, wait);
    }
  }

  function startStory(): void {
    storyPlaying = true;
    storyButton.setAttribute('aria-pressed', 'true');
    storyButton.textContent = 'Pause the story';
    if (current >= chapters.length - 2) {
      current = -1;
      goTo(0);
    } else {
      const s = stepState(chapters[current]);
      storyTimer = window.setTimeout(() => storyPlaying && goTo(current + 1), reduced ? 1500 : s.hold);
    }
  }
  function stopStory(): void {
    storyPlaying = false;
    clearTimeout(storyTimer);
    storyButton.setAttribute('aria-pressed', 'false');
    storyButton.textContent = 'Play the story';
  }

  prevButton.addEventListener('click', () => {
    stopStory();
    goTo(current - 1);
  });
  nextButton.addEventListener('click', () => {
    stopStory();
    goTo(current + 1);
  });
  storyButton.addEventListener('click', () => (storyPlaying ? stopStory() : startStory()));
  chapters.forEach((c, i) =>
    c.querySelector('.chapter-head')?.addEventListener('click', () => {
      stopStory();
      goTo(i);
    }),
  );
  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
    if (e.key === 'ArrowRight') {
      stopStory();
      goTo(current + 1);
    } else if (e.key === 'ArrowLeft') {
      stopStory();
      goTo(current - 1);
    }
  });

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

  // Initial state: a hash opens explore with that view; otherwise the first step.
  setPalette(initial.palette, false);
  setMode(initial.mode, 0, false);
  setYear(initial.year, 0, false);
  setLabels(false);
  stage.setBlank(true, 0);
  if (openedWithHash) goTo(chapters.length - 1);
  else goTo(0);
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
