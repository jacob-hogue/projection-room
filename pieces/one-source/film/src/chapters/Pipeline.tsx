import { CUTOFF, EASE, seg } from '../beats';
import { type Stats, formatDate, share } from '../changes';
import { Heading } from '../chrome';
import { MONO } from '../fonts';
import { enterAt, staggerAt } from '../frame';
import { Chip, Stat, StepRail, eyebrow, fmt, rise } from '../parts';
import { C } from '../theme';

/** Step windows in chapter seconds: detect, validate, publish, serve. */
export const STEP_AT = [0, 12, 24, 37, 50] as const;
const LEFT = 444;
const WIDTH = 1412;
const TOP = 220;
const FADE = 0.5;

const stepIndex = (local: number): number => (local >= STEP_AT[3] ? 3 : local >= STEP_AT[2] ? 2 : local >= STEP_AT[1] ? 1 : 0);

/** Visibility of a step's content: in from its start, out over FADE after its end. */
const stepAlpha = (local: number, i: number): number => {
  const start = STEP_AT[i];
  const end = STEP_AT[i + 1];
  return Math.min(seg(local, start, start + FADE), 1 - seg(local, end, end + FADE));
};

const HEADINGS = ['The nightly job, step 1 of 4: find what changed', 'The nightly job, step 2 of 4: validate the changes', 'The nightly job, step 3 of 4: publish the updates', 'The nightly job, step 4 of 4: serve every application'];

const panel: React.CSSProperties = { borderRadius: 12, background: C.surface, border: `1px solid ${C.hairline}`, boxSizing: 'border-box' };
const cell: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24, padding: '9px 26px' };

/** Output files carry the run date. */
const fileDate = (stats: Stats): string => stats.run;

const Detect: React.FC<{ local: number; stats: Stats }> = ({ local, stats }) => {
  const t = stats.town;
  return (
    <>
      <div style={{ position: 'absolute', left: LEFT, top: TOP, width: WIDTH, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24 }}>
        <Stat eyebrow="source records" value={t.n} enter={enterAt(local, 0.6, EASE.state)} />
        <Stat eyebrow={`edited since ${formatDate(CUTOFF)}`} value={t.since2023} enter={enterAt(local, 1.2, EASE.state)} live />
        <Stat eyebrow="share of the layer updated" value={share(t.since2023, t.n)} enter={enterAt(local, 1.8, EASE.state)} />
      </div>
      <div style={{ position: 'absolute', left: LEFT, top: TOP + 176, width: WIDTH, ...panel, overflow: 'hidden', fontFamily: MONO, fontSize: 19, ...rise(enterAt(local, 2.4, EASE.state)) }}>
        <div style={{ ...cell, borderBottom: `1px solid ${C.hairline}`, ...eyebrow(), fontSize: 13 }}>
          <div>loc_id</div>
          <div>town</div>
          <div>last_edit</div>
          <div>change</div>
        </div>
        {t.sample.map((r, i) => (
          <div key={r.loc} style={{ ...cell, borderBottom: `1px solid #1a2431`, color: C.secondary, background: i === 0 ? 'rgba(74,222,128,0.06)' : 'transparent', ...rise(staggerAt(local, 3.0, i, 0.35, EASE.state)) }}>
            <div style={{ color: C.text }}>{r.loc}</div>
            <div>{t.name}</div>
            <div>{formatDate(r.edit)}</div>
            <div>
              <Chip kind="changed">changed</Chip>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 26px', fontSize: 14, color: C.muted, ...rise(enterAt(local, 6.0, EASE.state)) }}>
          <div>{fmt(t.since2023)} of {fmt(t.n)} records</div>
          <div>based on edit tracking, not a full comparison</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 64, top: 600, width: 340, ...panel, padding: '18px 20px', fontFamily: MONO, fontSize: 15, lineHeight: '24px', color: C.secondary, ...rise(enterAt(local, 4.0, EASE.state)) }}>
        SELECT * FROM parcels
        <br />
        WHERE last_edited &gt; :last_run
        <br />
        &nbsp;&nbsp; OR deleted_at &gt; :last_run
      </div>
    </>
  );
};

const CHECKS = (t: Stats['town']) => [
  { name: 'Row count', detail: `${fmt(t.n)} rows in, ${fmt(t.n)} rows out`, result: 'match' },
  { name: 'Geometry', detail: `${fmt(t.n)} of ${fmt(t.n)} polygons valid`, result: 'valid' },
  { name: 'Schema', detail: '10 fields, names and types unchanged', result: 'unchanged' },
];

const Validate: React.FC<{ local: number; stats: Stats }> = ({ local, stats }) => {
  const l = local - STEP_AT[1];
  const checks = CHECKS(stats.town);
  return (
    <>
      <div style={{ position: 'absolute', left: LEFT, top: TOP, width: WIDTH, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {checks.map((c, i) => {
          const enter = staggerAt(l, 0.6, i, 1.5, EASE.state);
          const done = staggerAt(l, 1.8, i, 1.5, EASE.state);
          return (
            <div key={c.name} style={{ ...panel, height: 96, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 28, ...rise(enter) }}>
              <div style={{ width: 200, ...eyebrow(), fontSize: 14 }}>{c.name}</div>
              <div style={{ flex: 1, fontFamily: MONO, fontSize: 22, color: C.text }}>{c.detail}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, opacity: done, transform: `scale(${0.9 + 0.1 * done})` }}>
                <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center', background: C.green, color: C.greenInk, fontWeight: 500 }}>{'✓'}</span>
                {c.result}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: LEFT, top: TOP + 3 * 116 + 20, fontSize: 24, lineHeight: '34px', color: C.secondary, ...rise(enterAt(l, 6.6, EASE.state)) }}>
        All three checks passed. If any check fails, the job stops and records the reason in the log.
      </div>
    </>
  );
};

const Publish: React.FC<{ local: number; stats: Stats }> = ({ local, stats }) => {
  const l = local - STEP_AT[2];
  const t = stats.town;
  const date = fileDate(stats);
  const outputs = [
    { name: 'Hosted feature layer', file: `${fmt(t.since2023)} edits applied, no overwrite`, done: 'applied' },
    { name: 'GeoParquet', file: `parcels_${date}.parquet`, done: 'written' },
    { name: 'PMTiles', file: `parcels_${date}.pmtiles`, done: 'written' },
  ];
  return (
    <div style={{ position: 'absolute', left: LEFT, top: TOP, width: WIDTH, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {outputs.map((o, i) => {
        const enter = staggerAt(l, 0.6, i, 0.8, EASE.state);
        const fillAt = 1.6 + i * 2.2;
        const bar = EASE.inOut(seg(l, fillAt, fillAt + 2.0));
        const done = enterAt(l, fillAt + 2.0, EASE.enter);
        return (
          <div key={o.name} style={{ ...panel, height: 150, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 16, border: `1px solid ${bar >= 1 ? C.green : C.hairline}`, ...rise(enter) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 26, fontWeight: 600 }}>{o.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.green, opacity: done }}>{o.done}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: C.secondary }}>{o.file}</div>
            <div style={{ height: 6, borderRadius: 999, background: C.raised, overflow: 'hidden' }}>
              <div style={{ width: `${bar * 100}%`, height: '100%', background: C.green }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const READERS = ['Assessor web map', 'Planning viewer', 'Public works app', 'Dispatch map', 'Open data portal'];

const Serve: React.FC<{ local: number; stats: Stats }> = ({ local, stats }) => {
  const l = local - STEP_AT[3];
  const t = stats.town;
  const date = fileDate(stats);
  const log = [
    `run ${stats.run} 02:00`,
    `${fmt(t.since2023)} records changed since last run`,
    '3 checks passed',
    `hosted layer: ${fmt(t.since2023)} edits applied`,
    `parcels_${date}.parquet written`,
    `parcels_${date}.pmtiles written`,
    'done',
  ];
  return (
    <>
      <div style={{ position: 'absolute', left: LEFT, top: TOP, width: 680, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...eyebrow(), marginBottom: 4, ...rise(enterAt(l, 0.4)) }}>reads from shared outputs</div>
        {READERS.map((r, i) => (
          <div key={r} style={{ ...panel, height: 64, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 22, ...rise(staggerAt(l, 0.8, i, 0.5, EASE.state)) }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: C.green }} />
            <span>{r}</span>
            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 14, color: C.muted }}>no copy</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: LEFT + 716, top: TOP, width: WIDTH - 716, ...panel, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 10, ...rise(enterAt(l, 0.6, EASE.state)) }}>
        <div style={{ ...eyebrow(), marginBottom: 6 }}>run log</div>
        {log.map((line, i) => (
          <div key={line} style={{ fontFamily: MONO, fontSize: 17, lineHeight: '26px', color: i === log.length - 1 ? C.green : C.secondary, ...rise(staggerAt(l, 1.2, i, 0.6, EASE.state)) }}>
            {line}
          </div>
        ))}
      </div>
    </>
  );
};

export const Pipeline: React.FC<{ local: number; stats: Stats | null }> = ({ local, stats }) => {
  const active = stepIndex(local);
  const headingEnter = Math.min(enterAt(local - STEP_AT[active], 0.0, EASE.state), 1);
  return (
    <>
      <Heading text={HEADINGS[active]} enter={local < 0.2 ? enterAt(local, 0.2) : headingEnter} />
      <StepRail active={active} enter={enterAt(local, 0.4, EASE.state)} left={64} top={TOP} />
      {stats ? (
        <>
          {stepAlpha(local, 0) > 0 ? <div style={{ opacity: stepAlpha(local, 0) }}><Detect local={local} stats={stats} /></div> : null}
          {stepAlpha(local, 1) > 0 ? <div style={{ opacity: stepAlpha(local, 1) }}><Validate local={local} stats={stats} /></div> : null}
          {stepAlpha(local, 2) > 0 ? <div style={{ opacity: stepAlpha(local, 2) }}><Publish local={local} stats={stats} /></div> : null}
          {stepAlpha(local, 3) > 0 ? <div style={{ opacity: stepAlpha(local, 3) }}><Serve local={local} stats={stats} /></div> : null}
        </>
      ) : null}
    </>
  );
};
