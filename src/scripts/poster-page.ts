/** Mounts the 1947 map for the poster page and exposes the stage for render_poster.mjs. */
import type { Topology } from 'topojson-specification';
import { loadLineage } from '../lib/lineage';
import { MapStage } from '../lib/mapstage';
import { PALETTES } from '../lib/palette';

declare global {
  interface Window {
    __stage?: MapStage;
    __stageReady?: boolean;
  }
}

export async function mountPoster(width: number, height: number): Promise<void> {
  const svg = document.getElementById('stage') as SVGSVGElement | null;
  if (!svg) return;
  const base = import.meta.env.BASE_URL;
  const [topo, lineageJson] = await Promise.all([
    fetch(`${base}dial-pulse/areas.topojson`).then((r) => r.json() as Promise<Topology>),
    fetch(`${base}dial-pulse/lineage.json`).then((r) => r.json()),
  ]);
  const stage = new MapStage(svg, topo, { width, height, palette: PALETTES.signature, lineage: loadLineage(lineageJson) });
  stage.setYear(1947);
  stage.setLabels(true);
  stage.setLegend(true);
  window.__stage = stage;
  await document.fonts?.ready;
  window.__stageReady = true;
}
