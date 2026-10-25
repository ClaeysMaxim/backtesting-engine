import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { verifySha256 } from './checksum.ts';

const ZIP = new Uint8Array(
  readFileSync(new URL('fixtures/deflated.zip', import.meta.url)),
);
// Computed with `shasum -a 256`, independently of node:crypto.
const HASH = '95e3e2cb4f84d71a2761e28bdbd51828aa201fb2dfd8173a9108c5695c08fabb';
const NAME = 'BTCUSDT-1h-2025-06.zip';

describe('verifySha256', () => {
  it.each([
    ['Binance format', `${HASH}  ${NAME}`],
    ['a trailing newline', `${HASH}  ${NAME}\n`],
    ['binary mode marker', `${HASH} *${NAME}`],
    ['uppercase hex', `${HASH.toUpperCase()}  ${NAME}`],
  ])('accepts a matching hash in %s', (_, checksumFile) => {
    expect(() => {
      verifySha256(ZIP, checksumFile, NAME);
    }).not.toThrow();
  });

  it('rejects a checksum for another file', () => {
    expect(() => {
      verifySha256(ZIP, `${HASH}  ETHUSDT-1h-2025-06.zip`, NAME);
    }).toThrow(RangeError);
  });

  it('rejects data with one changed byte', () => {
    const damaged = ZIP.slice();
    damaged[100] = (damaged[100] ?? 0) ^ 1;

    expect(() => {
      verifySha256(damaged, `${HASH}  ${NAME}`, NAME);
    }).toThrow(RangeError);
  });

  it.each([
    ['an empty file', ''],
    ['a short hash', `${HASH.slice(1)}  ${NAME}`],
    ['a non-hex hash', `${'g'.repeat(64)}  ${NAME}`],
    ['no file name', HASH],
    ['two lines', `${HASH}  ${NAME}\n${HASH}  other.zip`],
  ])('rejects %s', (_, checksumFile) => {
    expect(() => {
      verifySha256(ZIP, checksumFile, NAME);
    }).toThrow(SyntaxError);
  });
});
