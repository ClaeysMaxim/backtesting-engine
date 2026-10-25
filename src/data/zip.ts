import { crc32, inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const END_RECORD_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const STORED = 0;
const DEFLATED = 8;
const ENCRYPTED_FLAG = 0x1;
const ZIP64_MARKER = 0xffffffff;

const names = new TextDecoder('utf-8', { fatal: true });

/**
 * Reads every file in a zip archive. Supports what Binance publishes: stored
 * or deflated entries without encryption or ZIP64. Each entry's CRC-32 and
 * size are checked, so a damaged archive fails instead of yielding bad data.
 */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    expectSignature(view, offset, CENTRAL_DIRECTORY_HEADER);
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = names.decode(slice(bytes, offset + 46, nameLength));
    if ((flags & ENCRYPTED_FLAG) !== 0) {
      throw new RangeError(`Encrypted zip entries are not supported: ${name}`);
    }
    if (compressedSize === ZIP64_MARKER || size === ZIP64_MARKER) {
      throw new RangeError(`ZIP64 entries are not supported: ${name}`);
    }
    const compressed = localData(view, bytes, localOffset, compressedSize);
    const data = decompress(compressed, method, name);
    if (data.length !== size || crc32(data) !== crc) {
      throw new SyntaxError(
        `Zip entry ${name} is damaged: size or CRC-32 differs`,
      );
    }
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndRecord(view: DataView): number {
  const last = view.byteLength - END_RECORD_SIZE;
  const first = Math.max(0, last - MAX_COMMENT_SIZE);
  for (let offset = last; offset >= first; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new SyntaxError('Not a zip archive: no end of central directory');
}

function localData(
  view: DataView,
  bytes: Uint8Array,
  offset: number,
  compressedSize: number,
): Uint8Array {
  expectSignature(view, offset, LOCAL_FILE_HEADER);
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  return slice(bytes, offset + 30 + nameLength + extraLength, compressedSize);
}

function decompress(
  data: Uint8Array,
  method: number,
  name: string,
): Uint8Array {
  if (method === STORED) {
    return data;
  }
  if (method === DEFLATED) {
    try {
      const inflated = inflateRawSync(data);
      return new Uint8Array(
        inflated.buffer,
        inflated.byteOffset,
        inflated.byteLength,
      );
    } catch (error) {
      throw new SyntaxError(`Zip entry ${name} is damaged: cannot inflate`, {
        cause: error,
      });
    }
  }
  throw new RangeError(
    `Compression method ${String(method)} is not supported: ${name}`,
  );
}

function expectSignature(view: DataView, offset: number, signature: number) {
  if (
    offset + 4 > view.byteLength ||
    view.getUint32(offset, true) !== signature
  ) {
    throw new SyntaxError(
      `Damaged zip archive: no record at byte ${String(offset)}`,
    );
  }
}

/** Like `subarray`, but throws instead of silently returning fewer bytes. */
function slice(bytes: Uint8Array, start: number, length: number): Uint8Array {
  if (start + length > bytes.length) {
    throw new SyntaxError('Damaged zip archive: data runs past the end');
  }
  return bytes.subarray(start, start + length);
}
