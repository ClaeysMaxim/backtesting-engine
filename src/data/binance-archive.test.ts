import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type Archive,
  archiveCsv,
  archiveFileName,
  archivePath,
  archiveUrl,
  monthRange,
} from './binance-archive.ts';

const june: Archive = { symbol: 'BTCUSDT', interval: '1h', month: '2025-06' };

describe('monthRange', () => {
  it('lists every month across a year boundary', () => {
    expect(monthRange('2024-11', '2025-02')).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ]);
  });

  it('returns a single month when both ends are equal', () => {
    expect(monthRange('2017-08', '2017-08')).toEqual(['2017-08']);
  });

  it('rejects a range that runs backwards', () => {
    expect(() => monthRange('2025-02', '2024-11')).toThrow(RangeError);
  });

  it.each(['2024-13', '2024-00', '2024-1', '24-01', '2024/01', ''])(
    'rejects month "%s"',
    (month) => {
      expect(() => monthRange(month, '2025-01')).toThrow(SyntaxError);
    },
  );
});

describe('archive naming', () => {
  it('names the file as Binance does', () => {
    expect(archiveFileName(june)).toBe('BTCUSDT-1h-2025-06.zip');
  });

  it('builds the public download URL', () => {
    expect(archiveUrl(june)).toBe(
      'https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2025-06.zip',
    );
  });

  it('mirrors the remote layout under the data folder on any OS', () => {
    const path = archivePath('data', june);

    expect(relative('data', path).split(sep)).toEqual([
      'binance',
      'spot',
      'monthly',
      'klines',
      'BTCUSDT',
      '1h',
      'BTCUSDT-1h-2025-06.zip',
    ]);
  });

  it.each(['btcusdt', 'BTC/USDT', '../BTC', ''])(
    'rejects symbol "%s"',
    (symbol) => {
      expect(() => archiveUrl({ ...june, symbol })).toThrow(RangeError);
    },
  );

  it('rejects a malformed month', () => {
    expect(() => archiveFileName({ ...june, month: '2025-6' })).toThrow(
      SyntaxError,
    );
  });
});

describe('archiveCsv', () => {
  const fixture = (path: string) =>
    new Uint8Array(readFileSync(new URL(`fixtures/${path}`, import.meta.url)));

  it('returns the CSV inside a Binance archive', () => {
    const csv = archiveCsv(june, fixture('binance/BTCUSDT-1h-2025-06.zip'));

    expect(csv.split('\n').filter((line) => line !== '')).toHaveLength(3);
    expect(csv.startsWith('1751317200000000,107577.88000000,')).toBe(true);
  });

  it.each(['deflated.zip', 'two-files.zip'])(
    'rejects %s, which holds other files',
    (name) => {
      expect(() => archiveCsv(june, fixture(name))).toThrow(
        /should contain only BTCUSDT-1h-2025-06\.csv/,
      );
    },
  );
});
