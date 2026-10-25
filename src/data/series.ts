import type { Candle } from '../domain/candle.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Binance kline intervals with a fixed length. Monthly candles ("1M") vary in
 * length and are not supported.
 */
export const INTERVALS = {
  '1s': 1_000,
  '1m': MINUTE,
  '3m': 3 * MINUTE,
  '5m': 5 * MINUTE,
  '15m': 15 * MINUTE,
  '30m': 30 * MINUTE,
  '1h': HOUR,
  '2h': 2 * HOUR,
  '4h': 4 * HOUR,
  '6h': 6 * HOUR,
  '8h': 8 * HOUR,
  '12h': 12 * HOUR,
  '1d': DAY,
  '3d': 3 * DAY,
  '1w': 7 * DAY,
} as const satisfies Record<string, number>;

export type Interval = keyof typeof INTERVALS;

export function isInterval(text: string): text is Interval {
  return Object.hasOwn(INTERVALS, text);
}

export type SeriesProblem =
  | { readonly kind: 'wrong-length'; readonly openTime: number }
  | { readonly kind: 'duplicate'; readonly openTime: number }
  | { readonly kind: 'out-of-order'; readonly openTime: number }
  | { readonly kind: 'overlap'; readonly openTime: number }
  | { readonly kind: 'misaligned'; readonly openTime: number }
  | {
      readonly kind: 'gap';
      readonly from: number;
      readonly to: number;
      /** Whole candles that fit between `from` and `to`. */
      readonly missing: number;
    };

/**
 * Lists everything that makes `candles` differ from one unbroken run of
 * `interval` candles, in the order found. An empty list means the series is
 * sorted and gapless, with no duplicates or overlaps, and every candle has
 * the right length.
 */
export function findSeriesProblems(
  candles: readonly Candle[],
  interval: Interval,
): SeriesProblem[] {
  const length = INTERVALS[interval];
  const problems: SeriesProblem[] = [];
  let previous: Candle | undefined;
  for (const candle of candles) {
    if (candle.closeTime - candle.openTime !== length) {
      problems.push({ kind: 'wrong-length', openTime: candle.openTime });
    }
    if (previous !== undefined) {
      const { openTime } = candle;
      if (openTime === previous.openTime) {
        problems.push({ kind: 'duplicate', openTime });
      } else if (openTime < previous.openTime) {
        problems.push({ kind: 'out-of-order', openTime });
      } else if (openTime < previous.closeTime) {
        problems.push({ kind: 'overlap', openTime });
      } else if (openTime > previous.closeTime) {
        const span = openTime - previous.closeTime;
        problems.push({
          kind: 'gap',
          from: previous.closeTime,
          to: openTime,
          missing: Math.floor(span / length),
        });
        if (span % length !== 0) {
          problems.push({ kind: 'misaligned', openTime });
        }
      }
    }
    previous = candle;
  }
  return problems;
}
