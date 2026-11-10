/**
 * The architecture diagram as data: nodes on the 1920 by 1080 grid and the segments that join
 * them. Every arrow is derived from the node table, so moving a node moves its arrows.
 */

export type NodeKind = 'writer' | 'source' | 'step' | 'log' | 'output' | 'readers';

export interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
}

export interface Segment {
  x1: number;
  y1: number;
  /** The far end; for a headed segment this is the tip, one pixel short of the node it points at. */
  x2: number;
  y2: number;
  head: boolean;
  color: 'grey' | 'green';
  /** Draw-in sequence; segments sharing an order draw together. */
  order: number;
}

export const NODES: Node[] = [
  { id: 'assessor', x: 64, y: 320, w: 200, h: 72, kind: 'writer' },
  { id: 'field', x: 64, y: 440, w: 200, h: 72, kind: 'writer' },
  { id: 'planning', x: 64, y: 560, w: 200, h: 72, kind: 'writer' },
  { id: 'source', x: 336, y: 376, w: 280, h: 200, kind: 'source' },
  { id: 'detect', x: 696, y: 416, w: 220, h: 120, kind: 'step' },
  { id: 'validate', x: 964, y: 416, w: 220, h: 120, kind: 'step' },
  { id: 'publish', x: 1232, y: 416, w: 220, h: 120, kind: 'step' },
  { id: 'log', x: 1232, y: 580, w: 220, h: 64, kind: 'log' },
  { id: 'hosted', x: 1556, y: 320, w: 220, h: 72, kind: 'output' },
  { id: 'parquet', x: 1556, y: 440, w: 220, h: 72, kind: 'output' },
  { id: 'pmtiles', x: 1556, y: 560, w: 220, h: 72, kind: 'output' },
  { id: 'readers', x: 696, y: 720, w: 1080, h: 72, kind: 'readers' },
];

/** The nightly-job band behind the three steps and the log. */
export const BAND = { x: 672, y: 300, w: 804, h: 360 } as const;

const node = (id: string): Node => {
  const n = NODES.find((k) => k.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
};
const midY = (n: Node) => n.y + n.h / 2;
const midX = (n: Node) => n.x + n.w / 2;
const right = (n: Node) => n.x + n.w;
const bottom = (n: Node) => n.y + n.h;

export function edges(): Segment[] {
  const writers = NODES.filter((n) => n.kind === 'writer');
  const outputs = NODES.filter((n) => n.kind === 'output');
  const src = node('source');
  const detect = node('detect');
  const validate = node('validate');
  const publish = node('publish');
  const log = node('log');
  const readers = node('readers');

  const writerBusX = right(writers[0]) + 36; // 300
  const outputBusX = right(publish) + 52; // 1504
  const readerBusX = right(outputs[0]) + 40; // 1816
  const readerY = midY(readers);

  const segs: Segment[] = [];
  // Writers into the source: three lines to a bus, the bus, one arrow into the source.
  for (const w of writers) segs.push({ x1: right(w), y1: midY(w), x2: writerBusX, y2: midY(w), head: false, color: 'grey', order: 0 });
  segs.push({ x1: writerBusX, y1: midY(writers[0]), x2: writerBusX, y2: midY(writers[writers.length - 1]), head: false, color: 'grey', order: 1 });
  segs.push({ x1: writerBusX, y1: midY(src), x2: src.x - 1, y2: midY(src), head: true, color: 'grey', order: 2 });
  // The source into the three steps, in sequence.
  segs.push({ x1: right(src), y1: midY(src), x2: detect.x - 1, y2: midY(src), head: true, color: 'green', order: 3 });
  segs.push({ x1: right(detect), y1: midY(detect), x2: validate.x - 1, y2: midY(detect), head: true, color: 'green', order: 4 });
  segs.push({ x1: right(validate), y1: midY(validate), x2: publish.x - 1, y2: midY(validate), head: true, color: 'green', order: 5 });
  // Publish down into the run log.
  segs.push({ x1: midX(publish), y1: bottom(publish), x2: midX(publish), y2: log.y - 1, head: true, color: 'grey', order: 6 });
  // Publish out to a bus and into the three outputs.
  segs.push({ x1: right(publish), y1: midY(publish), x2: outputBusX, y2: midY(publish), head: false, color: 'green', order: 7 });
  segs.push({ x1: outputBusX, y1: midY(outputs[0]), x2: outputBusX, y2: midY(outputs[outputs.length - 1]), head: false, color: 'green', order: 7 });
  for (const o of outputs) segs.push({ x1: outputBusX, y1: midY(o), x2: o.x - 1, y2: midY(o), head: true, color: 'green', order: 8 });
  // The outputs out to a bus that runs down into the readers' right edge.
  for (const o of outputs) segs.push({ x1: right(o), y1: midY(o), x2: readerBusX, y2: midY(o), head: false, color: 'green', order: 9 });
  segs.push({ x1: readerBusX, y1: midY(outputs[0]), x2: readerBusX, y2: readerY, head: false, color: 'green', order: 9 });
  segs.push({ x1: readerBusX, y1: readerY, x2: right(readers) + 1, y2: readerY, head: true, color: 'green', order: 10 });
  return segs;
}

export const segmentLength = (s: Segment): number => Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1);
