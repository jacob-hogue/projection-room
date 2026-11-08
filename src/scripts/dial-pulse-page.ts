/** Wires the dial-pulse page: data, the stage, chapter scrolling, the year play, controls, hash state. */
import type { Topology } from 'topojson-specification';
import { readHash, writeHash, type HashState } from '../lib/hashstate';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../lib/lineage';
import { MapStage, YEAR_MAX, YEAR_MIN, type HoverInfo, type Mode } from '../lib/mapstage';
import { PALETTES, type PaletteName } from '../lib/palette';

interface ChapterState {
  year: number;
  mode: Mode;
  labels: boolean;
  blank: boolean;
  play: { from: number; to: number; seconds: number } | null;
  explore: boolean;
}

const STAGE_W = 1200;
const STAGE_H = 760;

export async function mountDialPulse(): Promise<void> {
  const svgEl = document.getElementById('stage') as SVGSVGElement | null;
  const railEl = document.getElementById('rail');
  if (!svgEl || !railEl) return;
  const svg: SVGSVGElement = svgEl;
  const rail: HTMLElement = railEl;
  const base = import.meta.env.BASE_URL;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const controls = document.getElementById('controls') as HTMLFormElement;
  const yearInput = document.getElementById('year') as HTMLInputElement;
  const yearOut = document.getElementById('year-out') as HTMLOutputElement;
  const paletteSelect = document.getElementById('palette') as HTMLSelectElement;
  const labelsBox = document.getElementById('labels') as HTMLInputElement;
  const legendBox = document.getElementById('legend') as HTMLInputElement;
  const playButton = document.getElementById('play') as HTMLButtonElement;
  const readout = document.getElementById('readout') as HTMLOutputElement;
  const status = document.getElementById('stage-status') as HTMLElement;

  let state: HashState = { ...initial };
  let explore = false;
  let playing = false;
  let playFrame = 0;

  function setYear(year: number, writeUrl: boolean): void {
    state.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    stage.setYear(state.year);
    yearInput.value = String(state.year);
    yearOut.value = String(state.year);
    status.textContent = `${state.year}: ${countFor(state.year)} area codes in the lower 48`;
    if (writeUrl) writeUrl_();
  }
  function setMode(mode: Mode, writeUrl: boolean): void {
    state.mode = mode;
    stage.setMode(mode);
    const radio = controls.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    if (writeUrl) writeUrl_();
  }
  function setPalette(name: PaletteName, writeUrl: boolean): void {
    state.palette = name;
    stage.setPalette(PALETTES[name]);
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
    // The legend belongs to explore; chapters carry their own meaning. The checkbox keeps
    // the reader's choice while the map is pinned.
    stage.setLegend(on && legendBox.checked);
  }
  function writeUrl_(): void {
    if (!explore) return;
    history.replaceState(null, '', writeHash(state));
  }
  function countFor(year: number): number {
    let n = 0;
    for (const code of codesInEffect(year, lineage)) if (usOriginals.has(originalOf(code, lineage))) n++;
    return n;
  }

  // Year play: one rAF loop, mapped to time so it can be paused and resumed.
  function stopPlay(): void {
    playing = false;
    cancelAnimationFrame(playFrame);
    playButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = 'Play';
  }
  function startPlay(from: number, to: number, seconds: number, counter: HTMLElement | null): void {
    stopPlay();
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    playButton.textContent = 'Pause';
    const start = performance.now();
    const span = to - from;
    const tick = (now: number): void => {
      if (!playing) return;
      const t = Math.min(1, (now - start) / (seconds * 1000));
      const year = Math.round(from + t * span);
      if (year !== state.year) {
        setYear(year, false);
        if (counter) counter.textContent = `${year}: ${countFor(year)} codes`;
      }
      if (t < 1) playFrame = requestAnimationFrame(tick);
      else stopPlay();
    };
    playFrame = requestAnimationFrame(tick);
  }

  // Chapters.
  const chapters = [...document.querySelectorAll<HTMLElement>('.chapter')];
  function chapterState(el: HTMLElement): ChapterState {
    return {
      year: Number(el.dataset.year),
      mode: el.dataset.mode as Mode,
      labels: el.dataset.labels === 'true',
      blank: el.dataset.blank === 'true',
      play: el.dataset.play ? JSON.parse(el.dataset.play) : null,
      explore: el.dataset.explore === 'true',
    };
  }
  function applyChapter(el: HTMLElement): void {
    const s = chapterState(el);
    chapters.forEach((c) => c.classList.toggle('is-active', c === el));
    if (s.explore) {
      // Re-entering explore (the controls appearing shifts the layout) must not reset a view
      // the reader has already started changing.
      if (explore) return;
      stopPlay();
      setExplore(true);
      if (!hasHash()) {
        setMode(s.mode, false);
        setYear(s.year, false);
      }
      setLabels(s.labels);
      writeUrl_();
      return;
    }
    setExplore(false);
    stopPlay();
    svg.dataset.blank = String(s.blank);
    setMode(s.mode, false);
    setLabels(s.labels);
    const counter = el.querySelector<HTMLElement>('[data-counter]');
    if (s.play && !reduced) {
      setYear(s.play.from, false);
      startPlay(s.play.from, s.play.to, s.play.seconds, counter);
    } else if (s.play) {
      setYear(s.play.to, false);
      if (counter) counter.textContent = `${s.play.to}: ${countFor(s.play.to)} codes`;
    } else {
      setYear(s.year, false);
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) applyChapter(e.target as HTMLElement);
    },
    { threshold: 0.6 },
  );
  chapters.forEach((c) => observer.observe(c));

  // Controls.
  paletteSelect.addEventListener('change', () => setPalette(paletteSelect.value as PaletteName, true));
  controls.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => r.checked && setMode(r.value as Mode, true)),
  );
  yearInput.addEventListener('input', () => {
    stopPlay();
    setYear(Number(yearInput.value), true);
  });
  labelsBox.addEventListener('change', () => setLabels(labelsBox.checked));
  legendBox.addEventListener('change', () => setLegend(legendBox.checked));
  playButton.addEventListener('click', () => {
    if (playing) stopPlay();
    else {
      const from = state.year >= YEAR_MAX ? YEAR_MIN : state.year;
      startPlay(from, YEAR_MAX, ((YEAR_MAX - from) / (YEAR_MAX - YEAR_MIN)) * 20, null);
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
  setMode(initial.mode, false);
  setYear(initial.year, false);
  setLabels(false);
  svg.dataset.blank = 'true';
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
