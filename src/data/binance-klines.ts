import { parseAtoms } from '../domain/atoms.ts';
import { type Candle, createCandle } from '../domain/candle.ts';

const COLUMNS = 12;
const DIGITS = /^\d+$/;

/**
 * Parses one row of a Binance spot kline CSV. Older files give times in
 * milliseconds and newer ones in microseconds. Binance's close time is the
 * last instant of the candle, while `Candle.closeTime` is exclusive.
 */
export function parseKlineRow(row: string): Candle {
  const fields = row.split(',');
  if (fields.length !== COLUMNS) {
    throw new SyntaxError(
      `Expected ${String(COLUMNS)} columns, got ${String(fields.length)}: "${row}"`,
    );
  }
  // The column count is checked above; an empty default fails to parse below.
  const [
    openTime = '',
    open = '',
    high = '',
    low = '',
    close = '',
    volume = '',
    closeTime = '',
  ] = fields;
  const unit = timeUnit(openTime);
  return createCandle({
    openTime: toMilliseconds(parseTime(openTime), unit),
    closeTime: toMilliseconds(parseTime(closeTime) + 1n, unit),
    open: parseAtoms(open),
    high: parseAtoms(high),
    low: parseAtoms(low),
    close: parseAtoms(close),
    volume: parseAtoms(volume),
  });
}

/** Parses a whole kline CSV file; a header line, if present, is skipped. */
export function parseKlineCsv(text: string): Candle[] {
  const rows = text.split(/\r?\n/).filter((row) => row !== '');
  const first = rows[0];
  const hasHeader = first !== undefined && !/^\d/.test(first);
  return (hasHeader ? rows.slice(1) : rows).map(parseKlineRow);
}

/** Time units per millisecond: 13 digits are ms, 16 digits are µs. */
function timeUnit(openTime: string): bigint {
  if (openTime.length === 13) {
    return 1n;
  }
  if (openTime.length === 16) {
    return 1_000n;
  }
  throw new RangeError(
    `Open time must have 13 (ms) or 16 (µs) digits, got "${openTime}"`,
  );
}

function parseTime(text: string): bigint {
  if (!DIGITS.test(text)) {
    throw new SyntaxError(`Not an integer timestamp: "${text}"`);
  }
  return BigInt(text);
}

function toMilliseconds(time: bigint, unit: bigint): number {
  if (time % unit !== 0n) {
    throw new RangeError(
      `Timestamp ${time.toString()} is not a whole number of milliseconds`,
    );
  }
  return Number(time / unit);
}
