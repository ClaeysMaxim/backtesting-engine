import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { divide } from './rounding.ts';

describe('divide', () => {
  it.each([
    { numerator: 7n, denominator: 2n, floor: 3n, ceil: 4n },
    { numerator: -7n, denominator: 2n, floor: -4n, ceil: -3n },
    { numerator: 6n, denominator: 3n, floor: 2n, ceil: 2n },
    { numerator: -6n, denominator: 3n, floor: -2n, ceil: -2n },
    { numerator: 0n, denominator: 5n, floor: 0n, ceil: 0n },
    { numerator: 1n, denominator: 10_000n, floor: 0n, ceil: 1n },
    { numerator: -1n, denominator: 10_000n, floor: -1n, ceil: 0n },
  ])(
    'rounds $numerator / $denominator',
    ({ numerator, denominator, floor, ceil }) => {
      expect(divide(numerator, denominator, 'floor')).toBe(floor);
      expect(divide(numerator, denominator, 'ceil')).toBe(ceil);
    },
  );

  it('stays exact far beyond the safe integer range of number', () => {
    const big = 2n ** 80n + 1n;

    expect(divide(big, 2n, 'floor')).toBe(2n ** 79n);
    expect(divide(big, 2n, 'ceil')).toBe(2n ** 79n + 1n);
  });

  it.each([0n, -1n])('rejects denominator %s', (denominator) => {
    expect(() => divide(1n, denominator, 'floor')).toThrow(RangeError);
  });

  const numerators = fc.bigInt();
  const denominators = fc.bigInt({ min: 1n });

  it('floor is the largest integer not above the exact quotient', () => {
    fc.assert(
      fc.property(numerators, denominators, (n, d) => {
        const q = divide(n, d, 'floor');
        return q * d <= n && n < (q + 1n) * d;
      }),
    );
  });

  it('ceil is the smallest integer not below the exact quotient', () => {
    fc.assert(
      fc.property(numerators, denominators, (n, d) => {
        const q = divide(n, d, 'ceil');
        return (q - 1n) * d < n && n <= q * d;
      }),
    );
  });

  it('floor and ceil differ by one exactly when the division is inexact', () => {
    fc.assert(
      fc.property(numerators, denominators, (n, d) => {
        const gap = divide(n, d, 'ceil') - divide(n, d, 'floor');
        return gap === (n % d === 0n ? 0n : 1n);
      }),
    );
  });
});
