/**
 * One price bar. Times are epoch milliseconds in UTC and `closeTime` is
 * exclusive, so it equals the `openTime` of the next bar. Prices are quote
 * atoms per base unit, volume is base atoms.
 */
export interface Candle {
  readonly openTime: number;
  readonly closeTime: number;
  readonly open: bigint;
  readonly high: bigint;
  readonly low: bigint;
  readonly close: bigint;
  readonly volume: bigint;
}

export function createCandle(fields: Candle): Candle {
  const { openTime, closeTime, open, high, low, close, volume } = fields;
  if (!Number.isSafeInteger(openTime) || !Number.isSafeInteger(closeTime)) {
    throw new RangeError(
      `Times must be integer milliseconds, got ${String(openTime)} and ${String(closeTime)}`,
    );
  }
  if (openTime < 0 || closeTime <= openTime) {
    throw new RangeError(
      `Close time ${String(closeTime)} must be after open time ${String(openTime)} and both non-negative`,
    );
  }
  if (low <= 0n) {
    throw new RangeError(`Prices must be positive, got low ${low.toString()}`);
  }
  if (low > open || low > close || high < open || high < close) {
    throw new RangeError(
      `Open and close must lie within low and high, got ` +
        `O ${open.toString()} H ${high.toString()} L ${low.toString()} C ${close.toString()}`,
    );
  }
  if (volume < 0n) {
    throw new RangeError(
      `Volume must be non-negative, got ${volume.toString()}`,
    );
  }
  return Object.freeze({
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
  });
}
