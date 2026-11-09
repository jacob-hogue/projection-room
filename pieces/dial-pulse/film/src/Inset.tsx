/**
 * A Northeast inset: its own MapStage, camera fixed on 212 at a wide fill so Long Island,
 * New Jersey and Connecticut give context. Driven frame by frame like the main stage.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { Topology } from 'topojson-specification';
import type { Lineage } from '../../../../src/lib/lineage';
import { MapStage, type Mode } from '../../../../src/lib/mapstage';
import { PALETTES } from '../../../../src/lib/palette';
import { INSET } from './beats';

interface Props {
  topo: Topology;
  states: Topology;
  lineage: Lineage;
  year: number;
  mode: Mode;
  focus: string[] | null;
  dim: number;
  blank: boolean;
  shown: string[];
  opacity: number;
  label: string;
}

export const Inset: React.FC<Props> = ({ topo, states, lineage, year, mode, focus, dim, blank, shown, opacity, label }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [stage, setStage] = useState<MapStage | null>(null);

  useLayoutEffect(() => {
    if (!ref.current || stage) return;
    const s = new MapStage(ref.current, topo, { width: INSET.width, height: INSET.height, palette: PALETTES.signature, lineage, states, flashNew: false });
    setStage(s);
  }, [topo, states, lineage, stage]);

  useLayoutEffect(() => {
    if (!stage) return;
    stage.setMode(mode, 0);
    stage.setYear(year, 0);
    stage.setLabels(false);
    if (blank) {
      stage.setBlank(true, 0);
      void stage.show(shown, { step: 0, duration: 0 });
      stage.dimAt(null, 1);
    } else {
      stage.revealAt([], 1);
      stage.dimAt(focus, dim);
    }
    stage.zoomTo('212', 0, 0.3);
  }, [stage, year, mode, focus, dim, blank, shown]);

  return (
    <div style={{ position: 'relative', width: INSET.width, height: INSET.height, opacity, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', background: '#0a0c11' }}>
      <svg ref={ref} width={INSET.width} height={INSET.height} viewBox={`0 0 ${INSET.width} ${INSET.height}`} style={{ display: 'block' }} />
      <div style={{ position: 'absolute', left: 10, top: 10, padding: '4px 8px', borderRadius: 6, background: 'rgba(10,12,17,0.8)', fontFamily: '"JetBrains Mono", monospace', fontSize: 13, letterSpacing: '0.08em', color: '#e8eaed', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
};
