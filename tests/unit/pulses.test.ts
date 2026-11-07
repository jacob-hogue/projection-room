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
    expect(middleDigitClass('909')).toBe('later');
    expect(middleDigitClass('984')).toBe('later');
  });
});
