/**
 * Callouts over the stage: a leader line from a territory's anchor to a two-line label.
 * Labels are HTML (crisp text, CSS transitions); the lines live in an SVG overlay that
 * shares the stage's viewBox, so positions are stage units and scale with it.
 */
export interface CalloutSpec {
  id: string;
  /** Anchor in stage units (already through the camera). */
  x: number;
  y: number;
  /** Label offset from the anchor, in stage units. */
  dx: number;
  dy: number;
  title: string;
  value: string;
}

export class Callouts {
  private readonly host: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly stageW: number;
  private readonly stageH: number;
  private readonly reduced: boolean;
  private shown = new Map<string, { label: HTMLElement; line: SVGLineElement }>();

  constructor(host: HTMLElement, stageW: number, stageH: number, reduced: boolean) {
    this.host = host;
    this.stageW = stageW;
    this.stageH = stageH;
    this.reduced = reduced;
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.setAttribute('class', 'callout-lines');
    this.lines.setAttribute('viewBox', `0 0 ${stageW} ${stageH}`);
    this.lines.setAttribute('aria-hidden', 'true');
    host.appendChild(this.lines);
  }

  show(raw: CalloutSpec): void {
    this.hide(raw.id);
    const spec = this.clamp(raw);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'callout-line');
    line.setAttribute('x1', String(spec.x));
    line.setAttribute('y1', String(spec.y));
    line.setAttribute('x2', String(spec.x + spec.dx));
    line.setAttribute('y2', String(spec.y + spec.dy));
    const length = Math.hypot(spec.dx, spec.dy);
    line.setAttribute('stroke-dasharray', String(length));
    line.setAttribute('stroke-dashoffset', this.reduced ? '0' : String(length));
    this.lines.appendChild(line);

    const label = document.createElement('div');
    label.className = 'callout';
    label.dataset.id = spec.id;
    const title = document.createElement('span');
    title.className = 'callout-title';
    title.textContent = spec.title;
    const value = document.createElement('span');
    value.className = 'callout-value mono';
    value.textContent = spec.value;
    label.append(title, value);
    const lx = ((spec.x + spec.dx) / this.stageW) * 100;
    const ly = ((spec.y + spec.dy) / this.stageH) * 100;
    label.style.left = `${lx}%`;
    label.style.top = `${ly}%`;
    label.classList.toggle('is-left', spec.dx < 0);
    label.classList.toggle('is-above', spec.dy < 0);
    this.host.appendChild(label);
    this.shown.set(spec.id, { label, line });

    if (this.reduced) {
      label.classList.add('is-in');
      return;
    }
    // Draw the line, then bring the label in.
    requestAnimationFrame(() => {
      line.setAttribute('stroke-dashoffset', '0');
      setTimeout(() => label.classList.add('is-in'), 260);
    });
  }

  /** Keep the label inside the stage: flip the offset when it would run off an edge. */
  private clamp(spec: CalloutSpec): CalloutSpec {
    const labelW = 0.16 * this.stageW; // room for a two-line label, in stage units
    const labelH = 0.08 * this.stageH;
    let { dx, dy } = spec;
    const right = spec.x + dx + labelW;
    const left = spec.x + dx - (dx < 0 ? labelW : 0);
    if (dx >= 0 && right > this.stageW) dx = -Math.abs(dx);
    else if (dx < 0 && left < 0) dx = Math.abs(dx);
    if (spec.y + dy - labelH / 2 < 0) dy = Math.abs(dy);
    else if (spec.y + dy + labelH / 2 > this.stageH) dy = -Math.abs(dy);
    return { ...spec, dx, dy };
  }

  hide(id: string): void {
    const s = this.shown.get(id);
    if (!s) return;
    this.shown.delete(id);
    s.label.classList.remove('is-in');
    s.line.setAttribute('stroke-dashoffset', s.line.getAttribute('stroke-dasharray') ?? '0');
    const remove = () => {
      s.label.remove();
      s.line.remove();
    };
    if (this.reduced) remove();
    else setTimeout(remove, 320);
  }

  clear(): void {
    for (const id of [...this.shown.keys()]) this.hide(id);
  }

  ids(): string[] {
    return [...this.shown.keys()];
  }
}
