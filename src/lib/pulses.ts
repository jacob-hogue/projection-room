/** Dial pulses for a three-digit area code on a rotary phone: one click per digit, ten for a zero. */
export function pulses(code: string): number {
  if (!/^\d{3}$/.test(code)) {
    throw new RangeError(`area code must be exactly three digits, got "${code}"`);
  }
  let total = 0;
  for (const ch of code) {
    const d = Number(ch);
    total += d === 0 ? 10 : d;
  }
  return total;
}

export type MiddleDigitClass = 'whole' | 'subdivided' | 'later';

/**
 * The 1947 plan put a 0 in the middle of codes covering a whole state or province
 * and a 1 in the middle of codes for subdivided ones. Anything else came later.
 */
export function middleDigitClass(code: string): MiddleDigitClass {
  if (!/^\d{3}$/.test(code)) {
    throw new RangeError(`area code must be exactly three digits, got "${code}"`);
  }
  const middle = code[1];
  if (middle === '0') return 'whole';
  if (middle === '1') return 'subdivided';
  return 'later';
}
