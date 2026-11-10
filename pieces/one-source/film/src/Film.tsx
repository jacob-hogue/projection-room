import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Topology } from 'topojson-specification';
import { chapterStart } from './beats';
import type { Stats } from './changes';
import { Architecture } from './chapters/Architecture';
import { End } from './chapters/End';
import { MapProduct } from './chapters/MapProduct';
import { Opening } from './chapters/Opening';
import { Parts } from './chapters/Parts';
import { Pipeline } from './chapters/Pipeline';
import { Problem } from './chapters/Problem';
import { Caption, Header, Sheet } from './chrome';
import { frameAt } from './frame';

interface Data {
  towns: Topology;
  parcels: Topology;
  stats: Stats;
}

/** The chapter for an index: -1 opening, 0..4 chapters, 5 end card. */
const Chapter: React.FC<{ index: number; local: number; data: Data | null }> = ({ index, local, data }) => {
  switch (index) {
    case -1:
      return <Opening local={local} />;
    case 0:
      return <Problem local={local} />;
    case 1:
      return <Parts local={local} />;
    case 2:
      return <Architecture local={local} />;
    case 3:
      return <Pipeline local={local} stats={data?.stats ?? null} />;
    case 4:
      return <MapProduct local={local} towns={data?.towns ?? null} parcels={data?.parcels ?? null} stats={data?.stats ?? null} />;
    case 5:
      return <End local={local} />;
    default:
      return null;
  }
};

export const Film: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const f = frameAt(t);
  const [handle] = useState(() => delayRender('one-source data'));
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [towns, parcels, stats] = await Promise.all([
        fetch(staticFile('towns.topojson')).then((r) => r.json() as Promise<Topology>),
        fetch(staticFile('parcels.topojson')).then((r) => r.json() as Promise<Topology>),
        fetch(staticFile('stats.json')).then((r) => r.json() as Promise<Stats>),
      ]);
      if (cancelled) return;
      setData({ towns, parcels, stats });
      continueRender(handle);
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const dissolving = f.alpha < 1 && f.chapter > -1;
  const prev = f.chapter - 1;
  return (
    <Sheet>
      {dissolving ? (
        <AbsoluteFill style={{ opacity: 1 - f.alpha }}>
          <Chapter index={prev} local={t - chapterStart(prev)} data={data} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ opacity: f.chapter === -1 ? 1 : f.alpha }}>
        <Chapter index={f.chapter} local={f.local} data={data} />
      </AbsoluteFill>
      <Header t={t} />
      <Caption t={t} />
    </Sheet>
  );
};
