import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseAtoms } from './atoms.ts';
import { type Candle, createCandle } from './candle.ts';

const HOUR = 3_600_000;

// BTCUSDT 1h, 2025-06-01 00:00 UTC, from Binance's public data.
const sample: Candle = {
  openTime: 1_748_736_000_000,
  closeTime: 1_748_736_000_000 + HOUR,
  open: parseAtoms('104591.88'),
  high: parseAtoms('104647.11'),
  low: parseAtoms('104320.02'),
  close: parseAtoms('104446.49'),
  volume: parseAtoms('293.78295'),
};

describe('createCandle', () => {
  it('accepts a real candle and freezes it', () => {
    const candle = createCandle(sample);

    expect(candle).toEqual(sample);
    expect(Object.isFrozen(candle)).toBe(true);
  });

  it('accepts a candle without trades', () => {
    const flat = sample.close;

    expect(() =>
      createCandle({
        ...sample,
        open: flat,
        high: flat,
        low: flat,
        close: flat,
        volume: 0n,
      }),
    ).not.toThrow();
  });

  it.each<[string, Partial<Candle>]>([
    ['fractional open time', { openTime: 1.5 }],
    ['unsafe close time', { closeTime: Number.MAX_SAFE_INTEGER + 2 }],
    ['negative open time', { openTime: -HOUR, closeTime: 0 }],
    ['close time equal to open time', { closeTime: sample.openTime }],
    ['close time before open time', { closeTime: sample.openTime - 1 }],
    ['zero low', { low: 0n }],
    ['low above open', { low: sample.open + 1n }],
    ['low above close', { low: sample.close + 1n }],
    ['high below open', { high: sample.open - 1n }],
    ['high below close', { high: sample.close - 1n }],
    ['negative volume', { volume: -1n }],
  ])('rejects %s', (_, change) => {
    expect(() => createCandle({ ...sample, ...change })).toThrow(RangeError);
  });

  const offset = fc.bigInt({ min: 0n, max: 10n ** 12n });
  const validCandle = fc
    .record({
      low: fc.bigInt({ min: 1n, max: 10n ** 18n }),
      toOpen: offset,
      toClose: offset,
      aboveBoth: offset,
      volume: fc.bigInt({ min: 0n, max: 10n ** 24n }),
    })
    .map(({ low, toOpen, toClose, aboveBoth, volume }) => ({
      ...sample,
      low,
      open: low + toOpen,
      close: low + toClose,
      high: low + (toOpen > toClose ? toOpen : toClose) + aboveBoth,
      volume,
    }));

  it('accepts any candle with low <= open, close <= high', () => {
    fc.assert(
      fc.property(validCandle, (candle) => {
        return createCandle(candle).high === candle.high;
      }),
    );
  });

  it('rejects any candle whose high is below its open or close', () => {
    fc.assert(
      fc.property(
        validCandle,
        fc.bigInt({ min: 1n, max: 10n ** 6n }),
        (candle, gap) => {
          const top = candle.open > candle.close ? candle.open : candle.close;
          expect(() => createCandle({ ...candle, high: top - gap })).toThrow(
            RangeError,
          );
        },
      ),
    );
  });
});
