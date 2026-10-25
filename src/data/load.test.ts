import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseAtoms } from '../domain/atoms.ts';
import { type Candle, createCandle } from '../domain/candle.ts';
import {
  type Archive,
  archiveFileName,
  archivePath,
} from './binance-archive.ts';
import { assembleSeries, loadKlines } from './load.ts';
import { INTERVALS } from './series.ts';

const HOUR = INTERVALS['1h'];
// 2025-06-30 21:00 UTC: the first candle in the June fixture.
const JUNE_30_21H = 1_751_317_200_000;
const FIXTURES = fileURLToPath(new URL('fixtures/binance/', import.meta.url));

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'backtesting-engine-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

/** Puts a fixture archive and its checksum where the downloader would. */
async function install(month: string): Promise<string> {
  const archive: Archive = { symbol: 'BTCUSDT', interval: '1h', month };
  const path = archivePath(dataDir, archive);
  const name = archiveFileName(archive);
  await mkdir(dirname(path), { recursive: true });
  await copyFile(join(FIXTURES, name), path);
  await copyFile(join(FIXTURES, `${name}.CHECKSUM`), `${path}.CHECKSUM`);
  return path;
}

const options = {
  symbol: 'BTCUSDT',
  interval: '1h' as const,
  from: '2025-06',
  to: '2025-07',
};

describe('loadKlines', () => {
  it('joins consecutive months into one unbroken series', async () => {
    await install('2025-06');
    await install('2025-07');

    const { candles, gaps } = await loadKlines({ ...options, dataDir });

    expect(candles.map((c) => c.openTime)).toEqual(
      Array.from({ length: 6 }, (_, i) => JUNE_30_21H + i * HOUR),
    );
    expect(candles[0]).toEqual({
      openTime: JUNE_30_21H,
      closeTime: JUNE_30_21H + HOUR,
      open: parseAtoms('107577.88'),
      high: parseAtoms('107589.00'),
      low: parseAtoms('106900.02'),
      close: parseAtoms('107130.81'),
      volume: parseAtoms('441.72872'),
    });
    expect(gaps).toEqual([]);
  });

  it('says how to download a month that is missing', async () => {
    await install('2025-06');

    await expect(loadKlines({ ...options, dataDir })).rejects.toThrow(
      'npm run data:download -- --symbol BTCUSDT --interval 1h --from 2025-07 --to 2025-07',
    );
  });

  it('refuses an archive that changed on disk', async () => {
    await install('2025-06');
    await writeFile(await install('2025-07'), 'changed');

    await expect(loadKlines({ ...options, dataDir })).rejects.toThrow(
      RangeError,
    );
  });
});

describe('assembleSeries', () => {
  function candleAt(openTime: number): Candle {
    return createCandle({
      openTime,
      closeTime: openTime + HOUR,
      open: 1n,
      high: 1n,
      low: 1n,
      close: 1n,
      volume: 0n,
    });
  }

  const a = candleAt(JUNE_30_21H);
  const b = candleAt(JUNE_30_21H + HOUR);
  const c = candleAt(JUNE_30_21H + 2 * HOUR);

  it('returns a gap with the candles instead of failing', () => {
    const series = assembleSeries([[a], [c]], '1h');

    expect(series.candles).toHaveLength(2);
    expect(series.gaps).toEqual([
      {
        kind: 'gap',
        from: JUNE_30_21H + HOUR,
        to: JUNE_30_21H + 2 * HOUR,
        missing: 1,
      },
    ]);
  });

  it.each([
    ['a duplicate', [a, b, b]],
    ['candles out of order', [a, c, b]],
  ])('fails on %s', (_, candles) => {
    expect(() => assembleSeries([candles], '1h')).toThrow(RangeError);
  });

  it('returns an empty series for no candles', () => {
    expect(assembleSeries([], '1h')).toEqual({ candles: [], gaps: [] });
  });
});
