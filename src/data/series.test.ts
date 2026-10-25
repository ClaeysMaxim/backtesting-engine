import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { type Candle, createCandle } from '../domain/candle.ts';
import {
  findSeriesProblems,
  type Interval,
  INTERVALS,
  isInterval,
} from './series.ts';

const HOUR = INTERVALS['1h'];
const START = 1_748_736_000_000;

function candleAt(openTime: number, length = HOUR): Candle {
  return createCandle({
    openTime,
    closeTime: openTime + length,
    open: 1n,
    high: 1n,
    low: 1n,
    close: 1n,
    volume: 0n,
  });
}

function series(count: number, length = HOUR, start = START): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    candleAt(start + i * length, length),
  );
}

describe('isInterval', () => {
  it.each(['1s', '1m', '1h', '1d', '1w'])('accepts %s', (text) => {
    expect(isInterval(text)).toBe(true);
  });

  it.each(['1M', '2d', '', 'toString'])('rejects %s', (text) => {
    expect(isInterval(text)).toBe(false);
  });
});

describe('findSeriesProblems', () => {
  it('finds nothing in an unbroken series', () => {
    expect(findSeriesProblems(series(24), '1h')).toEqual([]);
  });

  it('finds nothing in an empty series', () => {
    expect(findSeriesProblems([], '1h')).toEqual([]);
  });

  it('reports a candle of the wrong length', () => {
    const candles = [candleAt(START, 2 * HOUR)];

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'wrong-length', openTime: START },
    ]);
  });

  it('reports a duplicate', () => {
    const [first, second] = series(2);
    const candles = [first, second, second].filter((c) => c !== undefined);

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'duplicate', openTime: START + HOUR },
    ]);
  });

  it('reports a gap with the number of missing candles', () => {
    const candles = series(5).filter((_, i) => i !== 2 && i !== 3);

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'gap', from: START + 2 * HOUR, to: START + 4 * HOUR, missing: 2 },
    ]);
  });

  it('reports two swapped candles', () => {
    const [c0, c1, c2, c3] = series(4);
    const candles = [c0, c2, c1, c3].filter((c) => c !== undefined);

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'gap', from: START + HOUR, to: START + 2 * HOUR, missing: 1 },
      { kind: 'out-of-order', openTime: START + HOUR },
      { kind: 'gap', from: START + 2 * HOUR, to: START + 3 * HOUR, missing: 1 },
    ]);
  });

  it('reports a candle that starts inside the previous one', () => {
    const candles = [candleAt(START), candleAt(START + HOUR / 2)];

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'overlap', openTime: START + HOUR / 2 },
    ]);
  });

  it('reports a candle that starts off the grid after a gap', () => {
    const candles = [candleAt(START), candleAt(START + HOUR + 1)];

    expect(findSeriesProblems(candles, '1h')).toEqual([
      { kind: 'gap', from: START + HOUR, to: START + HOUR + 1, missing: 0 },
      { kind: 'misaligned', openTime: START + HOUR + 1 },
    ]);
  });

  const unbroken = fc
    .record({
      interval: fc.constantFrom(...(Object.keys(INTERVALS) as Interval[])),
      count: fc.integer({ min: 0, max: 200 }),
      startIndex: fc.integer({ min: 0, max: 100_000 }),
    })
    .map(({ interval, count, startIndex }) => {
      const length = INTERVALS[interval];
      return { interval, candles: series(count, length, startIndex * length) };
    });

  it('finds nothing in any unbroken series', () => {
    fc.assert(
      fc.property(unbroken, ({ interval, candles }) => {
        return findSeriesProblems(candles, interval).length === 0;
      }),
    );
  });

  it('accounts for every removed inner candle as missing', () => {
    fc.assert(
      fc.property(
        unbroken.filter(({ candles }) => candles.length >= 3),
        fc.array(fc.nat(), { maxLength: 20 }),
        ({ interval, candles }, picks) => {
          const inner = candles.length - 2;
          const removed = new Set(picks.map((p) => 1 + (p % inner)));
          const kept = candles.filter((_, i) => !removed.has(i));
          const problems = findSeriesProblems(kept, interval);
          const missing = problems.reduce(
            (sum, p) => sum + (p.kind === 'gap' ? p.missing : Number.NaN),
            0,
          );
          return missing === removed.size;
        },
      ),
    );
  });
});
