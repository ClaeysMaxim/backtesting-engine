import { join } from 'node:path';

import type { Interval } from './series.ts';
import { readZip } from './zip.ts';

export const ARCHIVE_BASE_URL =
  'https://data.binance.vision/data/spot/monthly/klines';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const SYMBOL = /^[A-Z0-9]+$/;

/** One month of klines for one symbol and interval, as Binance archives it. */
export interface Archive {
  readonly symbol: string;
  readonly interval: Interval;
  /** "YYYY-MM" in UTC. */
  readonly month: string;
}

/** Every month from `from` to `to`, both "YYYY-MM" and inclusive. */
export function monthRange(from: string, to: string): string[] {
  const start = monthIndex(from);
  const end = monthIndex(to);
  if (start > end) {
    throw new RangeError(`Month range starts after it ends: ${from} to ${to}`);
  }
  const months: string[] = [];
  for (let index = start; index <= end; index++) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    months.push(`${String(year)}-${String(month).padStart(2, '0')}`);
  }
  return months;
}

export function archiveFileName({ symbol, interval, month }: Archive): string {
  if (!SYMBOL.test(symbol)) {
    throw new RangeError(`Invalid symbol: "${symbol}"`);
  }
  monthIndex(month);
  return `${symbol}-${interval}-${month}.zip`;
}

export function archiveUrl(archive: Archive): string {
  const { symbol, interval } = archive;
  return `${ARCHIVE_BASE_URL}/${symbol}/${interval}/${archiveFileName(archive)}`;
}

/** Where the archive is stored under `dataDir`, mirroring the remote layout. */
export function archivePath(dataDir: string, archive: Archive): string {
  const { symbol, interval } = archive;
  return join(
    dataDir,
    'binance',
    'spot',
    'monthly',
    'klines',
    symbol,
    interval,
    archiveFileName(archive),
  );
}

/**
 * The CSV text inside a downloaded archive. Binance zips hold exactly one
 * file named like the archive; anything else is rejected.
 */
export function archiveCsv(archive: Archive, zip: Uint8Array): string {
  const csvName = archiveFileName(archive).replace(/\.zip$/, '.csv');
  const entries = readZip(zip);
  const [entry] = entries;
  if (entries.length !== 1 || entry?.name !== csvName) {
    throw new SyntaxError(
      `${archiveFileName(archive)} should contain only ${csvName}`,
    );
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(entry.data);
}

function monthIndex(month: string): number {
  const [, year, number] = MONTH.exec(month) ?? [];
  if (year === undefined || number === undefined) {
    throw new SyntaxError(`Month must look like YYYY-MM, got "${month}"`);
  }
  return Number(year) * 12 + Number(number) - 1;
}
