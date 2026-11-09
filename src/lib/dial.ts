/**
 * A rotary dial that dials a number. The finger plate turns clockwise to the finger stop,
 * then returns at the real pulse rate (ten clicks a second), and one click mark appears
 * per pulse. Under reduced motion the clicks appear at once.
 */
export const PULSES_PER_SECOND = 10;
/** Degrees from a digit's hole to the finger stop: digit 1 is nearest the stop. */
const HOLE_STEP = 30;
const FIRST_HOLE = 60;
const INTERDIGIT_MS = 500;

export function pulsesOf(digit: string): number {
  return digit === '0' ? 10 : Number(digit);
}

/** Angle the plate turns for a digit (1 → 60°, 0 → 330°). */
export function turnFor(digit: string): number {
  return FIRST_HOLE + (pulsesOf(digit) - 1) * HOLE_STEP;
}

export interface DialHandles {
  plate: SVGGElement;
  clicks: HTMLElement;
  readout: HTMLElement | null;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Dial `number` on the given parts. Resolves when the last click has landed. */
export async function dial(parts: DialHandles, number: string, reduced: boolean, signal?: AbortSignal): Promise<void> {
  parts.clicks.replaceChildren();
  if (parts.readout) parts.readout.textContent = '';
  const total = [...number].reduce((n, d) => n + pulsesOf(d), 0);
  if (reduced) {
    for (let i = 0; i < total; i++) parts.clicks.appendChild(mark());
    if (parts.readout) parts.readout.textContent = `${number}: ${total} clicks`;
    return;
  }
  for (const digit of number) {
    if (signal?.aborted) return;
    const n = pulsesOf(digit);
    const angle = turnFor(digit);
    const wind = Math.max(350, angle * 3.5);
    parts.plate.style.transition = `transform ${wind}ms cubic-bezier(.4,0,.6,1)`;
    parts.plate.style.transform = `rotate(${angle}deg)`;
    await wait(wind + 120);
    if (signal?.aborted) return;
    const back = (n / PULSES_PER_SECOND) * 1000;
    parts.plate.style.transition = `transform ${back}ms linear`;
    parts.plate.style.transform = 'rotate(0deg)';
    for (let i = 0; i < n; i++) {
      await wait(1000 / PULSES_PER_SECOND);
      if (signal?.aborted) return;
      parts.clicks.appendChild(mark());
    }
    if (parts.readout) {
      const soFar = [...number.slice(0, number.indexOf(digit) + 1)].reduce((s, d) => s + pulsesOf(d), 0);
      parts.readout.textContent = `${number.slice(0, number.indexOf(digit) + 1)}: ${soFar} clicks`;
    }
    await wait(INTERDIGIT_MS);
  }
  if (parts.readout) parts.readout.textContent = `${number}: ${total} clicks`;
}

function mark(): HTMLElement {
  const m = document.createElement('span');
  m.className = 'click';
  return m;
}
