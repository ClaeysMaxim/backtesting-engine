import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  type Archive,
  archiveFileName,
  archivePath,
  archiveUrl,
} from './binance-archive.ts';
import { verifySha256 } from './checksum.ts';
import { readZip } from './zip.ts';

export type Fetch = (url: string) => Promise<Response>;

export interface DownloadResult {
  readonly path: string;
  readonly status: 'downloaded' | 'already present';
}

/**
 * Downloads one monthly archive and its checksum into `dataDir`. Both are
 * verified before anything is written, and an archive that is already on
 * disk and still matches its checksum is not downloaded again.
 */
export async function downloadArchive(
  archive: Archive,
  dataDir: string,
  fetchFn: Fetch = fetch,
): Promise<DownloadResult> {
  const path = archivePath(dataDir, archive);
  const checksumPath = `${path}.CHECKSUM`;
  const name = archiveFileName(archive);
  if (await isVerifiedOnDisk(path, checksumPath, name)) {
    return { path, status: 'already present' };
  }
  const url = archiveUrl(archive);
  const [zip, checksum] = await Promise.all([
    fetchBytes(fetchFn, url),
    fetchBytes(fetchFn, `${url}.CHECKSUM`),
  ]);
  verifySha256(zip, new TextDecoder().decode(checksum), name);
  const entries = readZip(zip);
  const csvName = name.replace(/\.zip$/, '.csv');
  if (entries.length !== 1 || entries[0]?.name !== csvName) {
    throw new SyntaxError(`${name} should contain only ${csvName}`);
  }
  await mkdir(dirname(path), { recursive: true });
  // The checksum is written last, so an interrupted run is retried next time.
  await writeFile(path, zip);
  await writeFile(checksumPath, checksum);
  return { path, status: 'downloaded' };
}

async function isVerifiedOnDisk(
  path: string,
  checksumPath: string,
  name: string,
): Promise<boolean> {
  try {
    const [zip, checksum] = await Promise.all([
      readFile(path),
      readFile(checksumPath, 'utf8'),
    ]);
    verifySha256(zip, checksum, name);
    return true;
  } catch (error) {
    // Missing or damaged files are downloaded again. Anything else, such as
    // a permission error, is a real problem and is not hidden.
    if (
      isMissingFile(error) ||
      error instanceof RangeError ||
      error instanceof SyntaxError
    ) {
      return false;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function fetchBytes(fetchFn: Fetch, url: string): Promise<Uint8Array> {
  const response = await fetchFn(url);
  if (!response.ok) {
    // HTTP/2 responses carry no status text, so it is only added when present.
    const reason = response.statusText === '' ? '' : ` ${response.statusText}`;
    throw new Error(
      `GET ${url} failed with HTTP ${String(response.status)}${reason}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
