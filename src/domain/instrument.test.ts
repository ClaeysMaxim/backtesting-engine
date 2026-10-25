import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createInstrument, floorToStep } from './instrument.ts';

const btcusdt = createInstrument({
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tickSize: '0.01000000',
  stepSize: '0.00001000',
});

describe('createInstrument', () => {
  it('converts Binance filter strings into atoms', () => {
    expect(btcusdt).toEqual({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tickSize: 1_000_000n,
      stepSize: 1_000n,
    });
  });

  it('handles whole-unit steps and one-atom ticks', () => {
    const shibusdt = createInstrument({
      baseAsset: 'SHIB',
      quoteAsset: 'USDT',
      tickSize: '0.00000001',
      stepSize: '1.00',
    });

    expect(shibusdt.tickSize).toBe(1n);
    expect(shibusdt.stepSize).toBe(100_000_000n);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(btcusdt)).toBe(true);
  });

  it.each(['', 'btc', 'BTC-USD', 'BTC ', 'ÉTH'])(
    'rejects asset code "%s"',
    (baseAsset) => {
      expect(() =>
        createInstrument({
          baseAsset,
          quoteAsset: 'USDT',
          tickSize: '0.01',
          stepSize: '0.001',
        }),
      ).toThrow(RangeError);
    },
  );

  it('accepts asset codes with digits', () => {
    const instrument = createInstrument({
      baseAsset: '1INCH',
      quoteAsset: 'USDT',
      tickSize: '0.001',
      stepSize: '0.1',
    });

    expect(instrument.symbol).toBe('1INCHUSDT');
  });

  it('rejects the same asset on both sides', () => {
    expect(() =>
      createInstrument({
        baseAsset: 'USDT',
        quoteAsset: 'USDT',
        tickSize: '0.01',
        stepSize: '0.01',
      }),
    ).toThrow(RangeError);
  });

  it.each([
    { tickSize: '0.00000000', stepSize: '0.001' },
    { tickSize: '0.01', stepSize: '0' },
  ])('rejects zero sizes ($tickSize, $stepSize)', ({ tickSize, stepSize }) => {
    expect(() =>
      createInstrument({
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        tickSize,
        stepSize,
      }),
    ).toThrow(RangeError);
  });
});

describe('floorToStep', () => {
  it.each([
    { quantity: 123_456n, expected: 123_000n },
    { quantity: 123_000n, expected: 123_000n },
    { quantity: 999n, expected: 0n },
    { quantity: 0n, expected: 0n },
  ])('rounds $quantity down to $expected', ({ quantity, expected }) => {
    expect(floorToStep(btcusdt, quantity)).toBe(expected);
  });

  it('rejects a negative quantity', () => {
    expect(() => floorToStep(btcusdt, -1n)).toThrow(RangeError);
  });

  it('returns the largest multiple of the step not above the quantity', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 24n }), (quantity) => {
        const result = floorToStep(btcusdt, quantity);
        return (
          result % btcusdt.stepSize === 0n &&
          result <= quantity &&
          quantity - result < btcusdt.stepSize
        );
      }),
    );
  });
});
