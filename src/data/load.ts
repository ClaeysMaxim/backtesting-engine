import { readFile } from 'node:fs/promises';

import type { Candle } from '../domain/candle.ts';
import {
  type Archive,
  archiveCsv,
  archiveFileName,
  archivePath,
  monthRange,
} from './binance-archive.ts';
import { parseKlineCsv } from './binance-klines.ts';
import { verifySha256 } from './checksum.ts';
import { isMissingFile } from './missing-file.ts';
import {
  findSeriesProblems,
  type Interval,
  type SeriesProblem,
} from './series.ts';

export type Gap = Extract<SeriesProblem, { kind: 'gap' }>;

export interface Series {
  readonly candles: readonly Candle[];
  /** Real exchange outages; they are reported, never filled in. */
  readonly gaps: readonly Gap[];
}

export interface LoadOptions {
  readonly dataDir: string;
  readonly symbol: string;
  readonly interval: Interval;
  /** First month, "YYYY-MM". */
  readonly from: string;
  /** Last month, "YYYY-MM", inclusive. */
  readonly to: string;
}

/**
 * Loads downloaded monthly archives into one series. Every archive is checked
 * against its checksum again, so data that changed on disk is never used.
 */
export async function loadKlines(options: LoadOptions): Promise<Series> {
  const { dataDir, symbol, interval } = options;
  const months: Candle[][] = [];
  for (const month of monthRange(options.from, options.to)) {
    months.push(await readArchive(dataDir, { symbol, interval, month }));
  }
  return assembleSeries(months, interval);
}

/**
 * Joins consecutive chunks of candles and validates the result. Gaps are
 * allowed and returned; any other problem means the data is broken.
 */
export function assembleSeries(
  chunks: readonly (readonly Candle[])[],
  interval: Interval,
): Series {
  const candles = chunks.flat();
  const problems = findSeriesProblems(candles, interval);
  const broken = problems.find((problem) => problem.kind !== 'gap');
  if (broken !== undefined) {
    throw new RangeError(
      `Candle series is broken (${String(problems.length)} problems), first: ${JSON.stringify(broken)}`,
    );
  }
  return {
    candles,
    gaps: problems.filter((problem) => problem.kind === 'gap'),
  };
}

async function readArchive(
  dataDir: string,
  archive: Archive,
): Promise<Candle[]> {
  const path = archivePath(dataDir, archive);
  let zip: Uint8Array;
  let checksum: string;
  try {
    [zip, checksum] = await Promise.all([
      readFile(path),
      readFile(`${path}.CHECKSUM`, 'utf8'),
    ]);
  } catch (error) {
    if (isMissingFile(error)) {
      const { symbol, interval, month } = archive;
      throw new Error(
        `${path} is missing. Download it with: npm run data:download -- --symbol ${symbol} --interval ${interval} --from ${month} --to ${month}`,
        { cause: error },
      );
    }
    throw error;
  }
  verifySha256(zip, checksum, archiveFileName(archive));
  return parseKlineCsv(archiveCsv(archive, zip));
}
