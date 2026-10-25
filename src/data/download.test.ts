import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Archive, archivePath, archiveUrl } from './binance-archive.ts';
import { downloadArchive, type Fetch } from './download.ts';

// Real BTCUSDT 1h rows (the last three hours of June 2025), zipped like
// Binance does, with a checksum file in Binance's format.
const june: Archive = { symbol: 'BTCUSDT', interval: '1h', month: '2025-06' };
const FIXTURES = new URL('fixtures/binance/', import.meta.url);
const ZIP = readFileSync(new URL('BTCUSDT-1h-2025-06.zip', FIXTURES));
const CHECKSUM = readFileSync(
  new URL('BTCUSDT-1h-2025-06.zip.CHECKSUM', FIXTURES),
);

/** Serves `files` by URL, records every request and answers 404 otherwise. */
function fakeServer(files: Record<string, Uint8Array | string>) {
  const requests: string[] = [];
  const fetchFn: Fetch = (url) => {
    requests.push(url);
    const body = files[url];
    return Promise.resolve(
      body === undefined
        ? new Response('Not Found', { status: 404, statusText: 'Not Found' })
        : new Response(body),
    );
  };
  return { fetchFn, requests };
}

const url = archiveUrl(june);
const binance = () => fakeServer({ [url]: ZIP, [`${url}.CHECKSUM`]: CHECKSUM });

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'backtesting-engine-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('downloadArchive', () => {
  it('downloads, verifies and stores the archive and its checksum', async () => {
    const { fetchFn } = binance();

    const result = await downloadArchive(june, dataDir, fetchFn);

    expect(result).toEqual({
      path: archivePath(dataDir, june),
      status: 'downloaded',
    });
    expect(readFileSync(result.path)).toEqual(ZIP);
    expect(readFileSync(`${result.path}.CHECKSUM`)).toEqual(CHECKSUM);
  });

  it('does not download an archive that is already verified on disk', async () => {
    await downloadArchive(june, dataDir, binance().fetchFn);
    const { fetchFn, requests } = binance();

    const result = await downloadArchive(june, dataDir, fetchFn);

    expect(result.status).toBe('already present');
    expect(requests).toEqual([]);
  });

  it('downloads again when the stored archive is damaged', async () => {
    const { path } = await downloadArchive(june, dataDir, binance().fetchFn);
    await writeFile(path, 'damaged');

    const result = await downloadArchive(june, dataDir, binance().fetchFn);

    expect(result.status).toBe('downloaded');
    expect(readFileSync(path)).toEqual(ZIP);
  });

  it('writes nothing when the checksum does not match', async () => {
    const wrong = `${'0'.repeat(64)}  BTCUSDT-1h-2025-06.zip`;
    const { fetchFn } = fakeServer({ [url]: ZIP, [`${url}.CHECKSUM`]: wrong });

    await expect(downloadArchive(june, dataDir, fetchFn)).rejects.toThrow(
      RangeError,
    );
    expect(existsSync(archivePath(dataDir, june))).toBe(false);
  });

  it('writes nothing when the archive is missing on the server', async () => {
    const { fetchFn } = fakeServer({});

    await expect(downloadArchive(june, dataDir, fetchFn)).rejects.toThrow(
      /failed with HTTP 404 Not Found$/,
    );
    expect(existsSync(archivePath(dataDir, june))).toBe(false);
  });

  it('reports an HTTP error without status text, as HTTP/2 sends it', async () => {
    const fetchFn: Fetch = () =>
      Promise.resolve(new Response(null, { status: 404 }));

    await expect(downloadArchive(june, dataDir, fetchFn)).rejects.toThrow(
      /failed with HTTP 404$/,
    );
  });

  it('rejects an archive that does not hold the expected CSV', async () => {
    const other = readFileSync(new URL('../deflated.zip', FIXTURES));
    // Hash of fixtures/deflated.zip, computed with `shasum -a 256`.
    const hash =
      '95e3e2cb4f84d71a2761e28bdbd51828aa201fb2dfd8173a9108c5695c08fabb';
    const { fetchFn } = fakeServer({
      [url]: other,
      [`${url}.CHECKSUM`]: `${hash}  BTCUSDT-1h-2025-06.zip`,
    });

    await expect(downloadArchive(june, dataDir, fetchFn)).rejects.toThrow(
      /should contain only BTCUSDT-1h-2025-06\.csv/,
    );
    expect(existsSync(archivePath(dataDir, june))).toBe(false);
  });
});
