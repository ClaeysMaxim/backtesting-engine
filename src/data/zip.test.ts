import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { readZip } from './zip.ts';

// The fixtures were made with Info-ZIP 3.0 (`zip -X -D`): deflated.zip with
// -9, stored.zip with -0, and two-files.zip with sample.csv and notes.txt.
function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(new URL(`fixtures/${name}`, import.meta.url)),
  );
}

const SAMPLE_CSV = Array.from(
  { length: 40 },
  (_, i) =>
    `${String(1_700_000_000_000 + (i + 1) * 3_600_000)},100.00000000,101.00000000,99.00000000,100.50000000,1.00000000\n`,
).join('');

const text = new TextDecoder();

/** Offset of the first central directory header, read from the end record. */
function centralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(bytes.length - 22 + 16, true);
}

function patched(
  bytes: Uint8Array,
  change: (view: DataView, central: number) => void,
): Uint8Array {
  const copy = bytes.slice();
  change(new DataView(copy.buffer), centralDirectory(copy));
  return copy;
}

describe('readZip', () => {
  it.each(['deflated.zip', 'stored.zip'])('extracts %s', (name) => {
    const entries = readZip(fixture(name));

    expect(entries.map((e) => e.name)).toEqual(['sample.csv']);
    expect(text.decode(entries[0]?.data)).toBe(SAMPLE_CSV);
  });

  it('extracts every entry of an archive with two files', () => {
    const entries = readZip(fixture('two-files.zip'));

    expect(entries.map((e) => [e.name, text.decode(e.data)])).toEqual([
      ['sample.csv', SAMPLE_CSV],
      ['notes.txt', 'second file\n'],
    ]);
  });

  it.each([
    ['deflated data', 'deflated.zip'],
    ['stored data', 'stored.zip'],
  ])('rejects damaged %s', (_, name) => {
    const bytes = fixture(name);
    // Local header (30 bytes) plus "sample.csv" (10 bytes) puts the data at 40.
    bytes[45] = (bytes[45] ?? 0) ^ 0xff;

    expect(() => readZip(bytes)).toThrow(SyntaxError);
  });

  it.each([
    ['an empty file', new Uint8Array(0)],
    ['text', new TextEncoder().encode('not a zip archive at all')],
    ['a truncated archive', fixture('deflated.zip').subarray(0, 200)],
  ])('rejects %s', (_, bytes) => {
    expect(() => readZip(bytes)).toThrow(SyntaxError);
  });

  it('rejects an entry whose recorded size is wrong', () => {
    const bytes = patched(fixture('deflated.zip'), (view, central) => {
      view.setUint32(central + 24, 3041, true);
    });

    expect(() => readZip(bytes)).toThrow(SyntaxError);
  });

  it('rejects an entry that runs past the end of the file', () => {
    const bytes = patched(fixture('stored.zip'), (view, central) => {
      view.setUint32(central + 20, 100_000, true);
    });

    expect(() => readZip(bytes)).toThrow(/runs past the end/);
  });

  it.each([
    ['local file header', () => 0],
    [
      'central directory header',
      (bytes: Uint8Array) => centralDirectory(bytes),
    ],
  ])('rejects a damaged %s signature', (_, offsetOf) => {
    const bytes = fixture('deflated.zip');
    const offset = offsetOf(bytes);
    bytes[offset] = (bytes[offset] ?? 0) ^ 0xff;

    expect(() => readZip(bytes)).toThrow(/no record at byte/);
  });

  it('rejects an encrypted entry', () => {
    const bytes = patched(fixture('stored.zip'), (view, central) => {
      view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
    });

    expect(() => readZip(bytes)).toThrow(RangeError);
  });

  it('rejects an unsupported compression method', () => {
    const bytes = patched(fixture('deflated.zip'), (view, central) => {
      view.setUint16(central + 10, 12, true);
    });

    expect(() => readZip(bytes)).toThrow(RangeError);
  });
});
