/**
 * The explore map at the end of the dial-pulse page: data, the stage, controls, hover
 * readout and the hash state. The stage is built only when the section comes into view.
 */
import { csvParse } from 'd3';
import type { Topology } from 'topojson-specification';
import { readHash, writeHash, type HashState } from '../lib/hashstate';
import { codesInEffect, loadLineage, originalOf, type Lineage } from '../lib/lineage';
import { MapStage, YEAR_MAX, YEAR_MIN, type HoverInfo, type Mode } from '../lib/mapstage';
import { PALETTES, pulseColor, type PaletteName } from '../lib/palette';
import { drawScatter } from '../lib/scatter';

const STAGE_W = 1200;
const STAGE_H = 760;

export function mountExplore(): void {
  mountScatter();
  const section = document.getElementById('explore');
  if (!section) return;
  const start = () => void build();
  if (location.hash.length > 1) {
    start();
    section.scrollIntoView({ block: 'start' });
    return;
  }
  if (!('IntersectionObserver' in window)) {
    start();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    },
    { rootMargin: '600px 0px' },
  );
  io.observe(section);
}

/** The clicks-against-population chart in the method section, drawn when it comes into view. */
function mountScatter(): void {
  const host = document.querySelector<HTMLElement>('#method [data-scatter]');
  if (!host) return;
  const base = import.meta.env.BASE_URL;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const draw = () =>
    fetch(`${base}dial-pulse/population_1950.csv`)
      .then((r) => r.text())
      .then((text) => {
        const rows = csvParse(text, (d) => ({ code: String(d.code), population_1950: Number(d.population_1950) }));
        drawScatter(host, rows, (clicks) => pulseColor(PALETTES.signature, clicks), reduced);
      });
  if (!('IntersectionObserver' in window)) {
    void draw();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void draw();
      }
    },
    { rootMargin: '400px 0px' },
  );
  io.observe(host);
}

async function build(): Promise<void> {
  const svg = document.getElementById('stage') as SVGSVGElement | null;
  if (!svg || svg.dataset.mounted) return;
  svg.dataset.mounted = 'true';
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
  const stage = new MapStage(svg, topo, { width: STAGE_W, height: STAGE_H, palette: PALETTES[initial.palette], lineage });
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
  controls.hidden = false;

  const state: HashState = { ...initial };
  let playing = false;
  let playFrame = 0;

  function countFor(year: number): number {
    let n = 0;
    for (const code of codesInEffect(year, lineage)) if (usOriginals.has(originalOf(code, lineage))) n++;
    return n;
  }
  function writeUrl(): void {
    history.replaceState(null, '', writeHash(state));
  }
  function setYear(year: number, duration: number, write: boolean): void {
    state.year = Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
    stage.setYear(state.year, duration);
    yearInput.value = String(state.year);
    yearOut.value = String(state.year);
    status.textContent = `${state.year}: ${countFor(state.year)} area codes in the lower 48`;
    if (write) writeUrl();
  }
  function setMode(mode: Mode, write: boolean): void {
    state.mode = mode;
    stage.setMode(mode, ms(600));
    const radio = controls.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    if (write) writeUrl();
  }
  function setPalette(name: PaletteName, write: boolean): void {
    state.palette = name;
    stage.setPalette(PALETTES[name], ms(600));
    paletteSelect.value = name;
    if (write) writeUrl();
  }
  function stopPlay(): void {
    playing = false;
    cancelAnimationFrame(playFrame);
    playButton.setAttribute('aria-pressed', 'false');
    playButton.textContent = 'Play';
  }
  function startPlay(from: number, to: number, seconds: number): void {
    stopPlay();
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    playButton.textContent = 'Pause';
    const startAt = performance.now();
    const span = to - from;
    const tick = (now: number): void => {
      if (!playing) return;
      const p = Math.min(1, (now - startAt) / (seconds * 1000));
      const year = Math.round(from + p * span);
      if (year !== state.year) setYear(year, 0, false);
      if (p < 1) playFrame = requestAnimationFrame(tick);
      else {
        stopPlay();
        writeUrl();
      }
    };
    playFrame = requestAnimationFrame(tick);
  }

  paletteSelect.addEventListener('change', () => setPalette(paletteSelect.value as PaletteName, true));
  controls.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => r.checked && setMode(r.value as Mode, true)),
  );
  yearInput.addEventListener('input', () => {
    stopPlay();
    setYear(Number(yearInput.value), ms(200), true);
  });
  labelsBox.addEventListener('change', () => stage.setLabels(labelsBox.checked));
  legendBox.addEventListener('change', () => stage.setLegend(legendBox.checked));
  playButton.addEventListener('click', () => {
    if (playing) stopPlay();
    else {
      const from = state.year >= YEAR_MAX ? YEAR_MIN : state.year;
      startPlay(from, YEAR_MAX, ((YEAR_MAX - from) / (YEAR_MAX - YEAR_MIN)) * 20);
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
    writeUrl();
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

  setPalette(initial.palette, false);
  setMode(initial.mode, false);
  setYear(initial.year, 0, false);
  stage.setLabels(labelsBox.checked);
  stage.setLegend(legendBox.checked);
  svg.dataset.ready = 'true';
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
