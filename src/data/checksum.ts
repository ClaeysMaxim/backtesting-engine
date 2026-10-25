import { createHash } from 'node:crypto';

// sha256sum format, as Binance publishes it: "<hash>  <name>"; "*" marks
// binary mode in some tools.
const CHECKSUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/i;

/**
 * Throws unless `bytes` has the SHA-256 hash that `checksumFile` lists for
 * `fileName`.
 */
export function verifySha256(
  bytes: Uint8Array,
  checksumFile: string,
  fileName: string,
): void {
  const [, expected, name] = CHECKSUM_LINE.exec(checksumFile.trim()) ?? [];
  if (expected === undefined || name === undefined) {
    throw new SyntaxError(`Not a SHA-256 checksum line: "${checksumFile}"`);
  }
  if (name !== fileName) {
    throw new RangeError(`Checksum is for ${name}, not for ${fileName}`);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected.toLowerCase()) {
    throw new RangeError(
      `SHA-256 of ${fileName} is ${actual}, expected ${expected}`,
    );
  }
}
