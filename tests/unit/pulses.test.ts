import { describe, expect, test } from 'vitest';
import { pulses, middleDigitClass } from '../../src/lib/pulses';

describe('pulses', () => {
  test('counts dial clicks with zero as ten', () => {
    expect(pulses('212')).toBe(5);
    expect(pulses('305')).toBe(18);
    expect(pulses('902')).toBe(21);
    expect(pulses('909')).toBe(28);
    expect(pulses('919')).toBe(19);
  });

  test('rejects anything but three digits', () => {
    expect(() => pulses('21')).toThrow(RangeError);
    expect(() => pulses('21a')).toThrow(RangeError);
    expect(() => pulses('2120')).toThrow(RangeError);
  });
});

describe('middleDigitClass', () => {
  test('classes whole, subdivided and later codes', () => {
    expect(middleDigitClass('305')).toBe('whole');
    expect(middleDigitClass('212')).toBe('subdivided');
    // 909 (1992) has a zero in the middle, so by digit alone it reads as a whole-state
    // code; whether a code is a later addition comes from the lineage year, not the digit.
    expect(middleDigitClass('909')).toBe('whole');
    expect(middleDigitClass('984')).toBe('later');
  });
});
