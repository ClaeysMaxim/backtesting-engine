import { describe, expect, it } from 'vitest';

import { parseAtoms } from '../domain/atoms.ts';
import { parseKlineCsv, parseKlineRow } from './binance-klines.ts';

// Real rows from Binance's public data: BTCUSDT 1h, August 2017 (milliseconds)
// and June 2025 (microseconds).
const ROW_2017 =
  '1502942400000,4261.48000000,4313.62000000,4261.32000000,4308.83000000,47.18100900,1502945999999,202366.13839304,171,35.16050300,150952.47794304,7887.63551305';
const ROW_2017_NEXT =
  '1502946000000,4308.83000000,4328.69000000,4291.37000000,4315.32000000,23.23491600,1502949599999,100304.82356749,102,21.44807100,92608.27972836,8039.26240152';
const ROW_2025 =
  '1748736000000000,104591.88000000,104647.11000000,104320.02000000,104446.49000000,293.78295000,1748739599999999,30688862.20908260,81426,131.48518000,13734263.47444880,0';

describe('parseKlineRow', () => {
  it('reads a row with millisecond times', () => {
    expect(parseKlineRow(ROW_2017)).toEqual({
      openTime: 1_502_942_400_000,
      closeTime: 1_502_946_000_000,
      open: parseAtoms('4261.48'),
      high: parseAtoms('4313.62'),
      low: parseAtoms('4261.32'),
      close: parseAtoms('4308.83'),
      volume: parseAtoms('47.181009'),
    });
  });

  it('reads a row with microsecond times into milliseconds', () => {
    const candle = parseKlineRow(ROW_2025);

    expect(candle.openTime).toBe(1_748_736_000_000);
    expect(candle.closeTime).toBe(1_748_739_600_000);
    expect(candle.close).toBe(parseAtoms('104446.49'));
  });

  it("makes the close time equal to the next candle's open time", () => {
    expect(parseKlineRow(ROW_2017).closeTime).toBe(
      parseKlineRow(ROW_2017_NEXT).openTime,
    );
  });

  it.each([
    ['too few columns', ROW_2017.split(',').slice(0, 11).join(',')],
    ['an extra column', `${ROW_2017},0`],
    ['a non-numeric price', ROW_2017.replace('4261.48000000', 'abc')],
    ['a negative price', ROW_2017.replace('4261.48000000', '-4261.48')],
    ['a non-numeric time', ROW_2017.replace('1502942400000', '15029424OOOOO')],
  ])('rejects %s with a SyntaxError', (_, row) => {
    expect(() => parseKlineRow(row)).toThrow(SyntaxError);
  });

  it.each([
    ['a time that is neither ms nor µs', ROW_2017.replace('1502942400000', '150294240000')],
    ['a µs time that is not a whole ms', ROW_2025.replace('1748736000000000', '1748736000000001')],
    ['high below close', ROW_2017.replace('4313.62000000', '4300.00000000')],
  ])('rejects %s with a RangeError', (_, row) => {
    expect(() => parseKlineRow(row)).toThrow(RangeError);
  });
});

describe('parseKlineCsv', () => {
  it('reads every line and ignores the final newline', () => {
    const candles = parseKlineCsv(`${ROW_2017}\n${ROW_2017_NEXT}\n`);

    expect(candles.map((c) => c.openTime)).toEqual([
      1_502_942_400_000, 1_502_946_000_000,
    ]);
  });

  it('accepts Windows line endings', () => {
    expect(parseKlineCsv(`${ROW_2017}\r\n${ROW_2017_NEXT}\r\n`)).toHaveLength(2);
  });

  it('skips a header line', () => {
    const header =
      'open_time,open,high,low,close,volume,close_time,quote_volume,count,taker_buy_volume,taker_buy_quote_volume,ignore';

    expect(parseKlineCsv(`${header}\n${ROW_2017}\n`)).toHaveLength(1);
  });

  it('returns no candles for an empty file', () => {
    expect(parseKlineCsv('')).toEqual([]);
  });
});
