import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ATOMS_PER_UNIT, notional, parseAtoms } from './atoms.ts';

describe('parseAtoms', () => {
  it('reads Binance strings at 8 decimals', () => {
    expect(parseAtoms('67123.45000000')).toBe(6_712_345_000_000n);
    expect(parseAtoms('0.00001000')).toBe(1_000n);
    expect(parseAtoms('0.00000001')).toBe(1n);
  });

  it('rejects a ninth significant decimal', () => {
    expect(() => parseAtoms('0.000000001')).toThrow(RangeError);
  });
});

describe('notional', () => {
  it('values 0.00001 BTC at 67123.45 USDT exactly', () => {
    const price = parseAtoms('67123.45');
    const quantity = parseAtoms('0.00001');

    expect(notional(price, quantity, 'floor')).toBe(parseAtoms('0.6712345'));
    expect(notional(price, quantity, 'ceil')).toBe(parseAtoms('0.6712345'));
  });

  it('rounds a value below one atom in the requested direction', () => {
    const price = parseAtoms('0.00000001');
    const quantity = parseAtoms('1');

    expect(notional(price, quantity, 'floor')).toBe(1n);
    expect(notional(price, quantity - 1n, 'floor')).toBe(0n);
    expect(notional(price, quantity - 1n, 'ceil')).toBe(1n);
  });

  it('handles volumes beyond the safe integer range of number', () => {
    const quantity = parseAtoms('15270000000000.00');
    const price = parseAtoms('0.00002500');

    expect(notional(price, quantity, 'floor')).toBe(parseAtoms('381750000'));
  });

  it.each([
    { price: -1n, quantity: 1n },
    { price: 1n, quantity: -1n },
  ])('rejects price $price and quantity $quantity', ({ price, quantity }) => {
    expect(() => notional(price, quantity, 'floor')).toThrow(RangeError);
  });

  const amounts = fc.bigInt({ min: 0n, max: 10n ** 24n });

  it('brackets the exact value between floor and ceil', () => {
    fc.assert(
      fc.property(amounts, amounts, (price, quantity) => {
        const exact = price * quantity;
        const low = notional(price, quantity, 'floor');
        const high = notional(price, quantity, 'ceil');
        return (
          low * ATOMS_PER_UNIT <= exact &&
          exact <= high * ATOMS_PER_UNIT &&
          high - low <= 1n
        );
      }),
    );
  });
});
