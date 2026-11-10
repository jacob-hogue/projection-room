/** Area code lineage: which codes a territory carried in a given year. Mirrors compute.py. */

export type LineageType = 'original' | 'split' | 'overlay';

export interface LineageRow {
  parent: string | null;
  year: number;
  type: LineageType;
}

export interface Lineage {
  codes: Record<string, LineageRow>;
}

export function loadLineage(json: { codes: Record<string, { parent: string | null; year: number; type: string }> }): Lineage {
  const codes: Record<string, LineageRow> = {};
  for (const [code, r] of Object.entries(json.codes)) {
    codes[code] = { parent: r.parent ?? null, year: r.year, type: r.type as LineageType };
  }
  return { codes };
}

function row(code: string, l: Lineage): LineageRow {
  const r = l.codes[code];
  if (!r) throw new Error(`area code ${code} is not in the lineage table`);
  return r;
}

export function originalOf(code: string, l: Lineage): string {
  let current = code;
  let r = row(current, l);
  while (r.parent) {
    current = r.parent;
    r = row(current, l);
  }
  return current;
}

export function codesInEffect(year: number, l: Lineage): Set<string> {
  const out = new Set<string>();
  for (const [code, r] of Object.entries(l.codes)) if (r.year <= year) out.add(code);
  return out;
}

/** The non-overlay code a 2015 territory carried in `year`. */
export function codeInEffectFor(territory: string, year: number, l: Lineage): string {
  let current = territory;
  let r = row(current, l);
  while (r.year > year || r.type === 'overlay') {
    if (!r.parent) throw new Error(`${territory} has no code in effect in ${year}`);
    current = r.parent;
    r = row(current, l);
  }
  return current;
}

/** All codes a territory carries in `year`: code in effect first, then overlays by year. */
const overlayChildren = new WeakMap<Lineage, Map<string, string[]>>();

/** Overlay codes by parent, built once per lineage table. */
function overlayKids(l: Lineage): Map<string, string[]> {
  let kids = overlayChildren.get(l);
  if (kids) return kids;
  kids = new Map<string, string[]>();
  for (const [code, r] of Object.entries(l.codes)) {
    if (r.type === 'overlay' && r.parent) kids.set(r.parent, [...(kids.get(r.parent) ?? []), code]);
  }
  overlayChildren.set(l, kids);
  return kids;
}

export function polygonCodes(territory: string, year: number, l: Lineage): string[] {
  const base = codeInEffectFor(territory, year, l);
  const kids = overlayKids(l);
  const found = [base];
  const seen = new Set(found);
  const stack = [base];
  while (stack.length) {
    const parent = stack.pop()!;
    for (const k of kids.get(parent) ?? []) {
      if (l.codes[k].year <= year && !seen.add(k) === false) {
        found.push(k);
        stack.push(k);
      }
    }
  }
  return found.sort((a, b) => l.codes[a].year - l.codes[b].year || Number(a) - Number(b));
}

/** Among codes carried in `year`, the one assigned earliest; ties broken numerically. */
export function displayCode(codes: string[], year: number, l: Lineage): string {
  const live = codes.filter((c) => row(c, l).year <= year);
  if (!live.length) throw new Error(`no code in effect in ${year}`);
  return live.sort((a, b) => l.codes[a].year - l.codes[b].year || Number(a) - Number(b))[0];
}

export function hasOverlay(codes: string[], year: number, l: Lineage): boolean {
  return codes.filter((c) => row(c, l).year <= year).length > 1;
}
