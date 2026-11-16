import { crc32 } from "./crc32.ts";
import type { RestoreRefusal } from "./restore-contract.ts";

const LOCAL_SIGNATURE = 0x04_03_4b_50;

export const LOCAL_BYTES = 30;

export class ZipRefused extends Error {
  readonly code: RestoreRefusal;

  constructor(code: RestoreRefusal, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ZipSource {
  readonly size: number;
  readonly read: (offset: number, length: number) => AsyncIterable<Uint8Array>;
}

export interface ZipEntry {
  readonly name: string;
  readonly size: number;
  readonly crc: number;
  readonly headerOffset: number;
}

export interface ZipDirectory {
  readonly entries: readonly ZipEntry[];
  readonly offset: number;
  readonly root: string;
}

export function joinedBytes(parts: readonly Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  parts.reduce((at, part) => {
    bytes.set(part, at);

    return at + part.length;
  }, 0);

  return bytes;
}

export async function bytesAt(
  source: Readonly<ZipSource>,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let held = 0;

  for await (const chunk of source.read(offset, length)) {
    parts.push(chunk);
    held += chunk.length;
  }

  if (held !== length) {
    throw new ZipRefused("not-a-zip", "The zip ends before the bytes its records name");
  }

  return joinedBytes(parts, length);
}

export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function wide(view: DataView, at: number): number {
  const value = view.getBigUint64(at, true);

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipRefused("not-a-zip", "A size or offset in the zip is too large");
  }

  return Number(value);
}

const NAMES = new TextEncoder();

export function localDataStart(
  bytes: Uint8Array,
  at: number,
  entry: Readonly<ZipEntry>,
): number | null {
  if (at < 0 || at + LOCAL_BYTES > bytes.length) return null;

  const header = viewOf(bytes.subarray(at, at + LOCAL_BYTES));

  if (header.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new ZipRefused("not-a-zip", "A local header of the zip is malformed");
  }

  const name = NAMES.encode(entry.name);
  const nameEnd = at + LOCAL_BYTES + name.length;

  if (header.getUint16(26, true) !== name.length) {
    throw new ZipRefused("not-a-zip", "A local header of the zip names another entry");
  }

  if (nameEnd > bytes.length) return null;

  if (!name.every((byte, position) => bytes[at + LOCAL_BYTES + position] === byte)) {
    throw new ZipRefused("not-a-zip", "A local header of the zip names another entry");
  }

  return nameEnd + header.getUint16(28, true);
}

export async function entryStart(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<number> {
  const headerBytes = LOCAL_BYTES + NAMES.encode(entry.name).length;
  const bytes = await bytesAt(source, entry.headerOffset, headerBytes);
  const start = localDataStart(bytes, 0, entry);

  if (start === null || entry.headerOffset + start + entry.size > directory.offset) {
    throw new ZipRefused("not-a-zip", "An entry of the zip runs past its end");
  }

  return entry.headerOffset + start;
}

export async function entryBytes(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<Uint8Array> {
  const bytes = await bytesAt(source, await entryStart(source, directory, entry), entry.size);

  if (crc32(bytes) !== entry.crc) {
    throw new ZipRefused("crc", "An entry of the zip does not match its checksum");
  }

  return bytes;
}

export const LOCAL_HEADER_ROOM = LOCAL_BYTES + 1024;

export interface ReadEntry {
  readonly entry: ZipEntry;
  readonly bytes: Uint8Array;
}

function sliceOf(
  region: Readonly<{ bytes: Uint8Array; base: number }>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Uint8Array | null {
  const start = localDataStart(region.bytes, entry.headerOffset - region.base, entry);

  if (start === null) return null;

  if (region.base + start + entry.size > directory.offset) {
    throw new ZipRefused("not-a-zip", "An entry of the zip runs past its end");
  }

  const bytes =
    start + entry.size > region.bytes.length
      ? null
      : region.bytes.subarray(start, start + entry.size);

  if (bytes !== null && crc32(bytes) !== entry.crc) {
    throw new ZipRefused("crc", "An entry of the zip does not match its checksum");
  }

  return bytes;
}

export async function entriesBytes(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entries: readonly ZipEntry[],
): Promise<readonly ReadEntry[]> {
  if (entries.length === 0) return [];

  const base = Math.min(...entries.map(({ headerOffset }) => headerOffset));

  const end = Math.min(
    directory.offset,
    Math.max(...entries.map(({ headerOffset, size }) => headerOffset + LOCAL_HEADER_ROOM + size)),
  );

  const region = { bytes: await bytesAt(source, base, Math.max(end - base, 0)), base };

  return Promise.all(
    entries.map(async (entry) => ({
      entry,
      bytes: sliceOf(region, directory, entry) ?? (await entryBytes(source, directory, entry)),
    })),
  );
}
