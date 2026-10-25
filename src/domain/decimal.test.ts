import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseDecimal } from './decimal.ts';

// Inverse of parseDecimal, used to generate inputs for the round-trip property.
function format(units: bigint, scale: number): string {
  const digits = units.toString().padStart(scale + 1, '0');
  return scale === 0
    ? digits
    : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

describe('parseDecimal', () => {
  it.each([
    { text: '0.01000000', scale: 8, units: 1_000_000n },
    { text: '67123.45000000', scale: 8, units: 6_712_345_000_000n },
    { text: '0.00000001', scale: 8, units: 1n },
    { text: '1', scale: 8, units: 100_000_000n },
    { text: '0', scale: 8, units: 0n },
    { text: '12.0', scale: 0, units: 12n },
    { text: '007.5', scale: 1, units: 75n },
    { text: '0.000000010', scale: 8, units: 1n },
  ])('parses "$text" at scale $scale', ({ text, scale, units }) => {
    expect(parseDecimal(text, scale)).toBe(units);
  });

  it('stays exact beyond the safe integer range of number', () => {
    expect(parseDecimal('123456789012345678.12345678', 8)).toBe(
      12_345_678_901_234_567_812_345_678n,
    );
  });

  it.each([
    { text: '0.000000011', scale: 8 },
    { text: '12.5', scale: 0 },
  ])('rejects "$text" at scale $scale as too precise', ({ text, scale }) => {
    expect(() => parseDecimal(text, scale)).toThrow(RangeError);
  });

  it.each([
    '',
    '.',
    '1.',
    '.5',
    '-1',
    '+1',
    '1e-8',
    ' 1',
    '1 ',
    '1,5',
    '0x10',
    'NaN',
    'Infinity',
    '1.2.3',
  ])('rejects malformed input "%s"', (text) => {
    expect(() => parseDecimal(text, 8)).toThrow(SyntaxError);
  });

  it.each([-1, 1.5, Number.NaN])('rejects scale %s', (scale) => {
    expect(() => parseDecimal('1', scale)).toThrow(RangeError);
  });

  const unitsAndScale = fc.tuple(
    fc.bigInt({ min: 0n, max: 10n ** 30n }),
    fc.integer({ min: 0, max: 18 }),
  );

  it('round-trips any value written with exactly `scale` decimals', () => {
    fc.assert(
      fc.property(unitsAndScale, ([units, scale]) => {
        return parseDecimal(format(units, scale), scale) === units;
      }),
    );
  });

  it('ignores trailing zeros beyond the scale', () => {
    fc.assert(
      fc.property(
        unitsAndScale,
        fc.integer({ min: 1, max: 10 }),
        ([units, scale], zeros) => {
          const text = format(units, scale) + (scale === 0 ? '.' : '');
          return parseDecimal(text + '0'.repeat(zeros), scale) === units;
        },
      ),
    );
  });
});
