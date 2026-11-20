import { readExactly } from "./capped.ts";
import { crc32 } from "./crc32.ts";
import { utf8Length } from "./encoding.ts";
import { LOCAL_HEADER_BYTES, LOCAL_SIGNATURE } from "./zip.ts";

export type ZipFault = "malformed" | "unsupported-method" | "bad-name" | "bad-checksum";

export class ZipRefused extends Error {
  readonly fault: ZipFault;

  constructor(fault: ZipFault, message: string) {
    super(message);
    this.fault = fault;
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

export function checkedEnd(
  limit: number,
  start: number | null,
  size: number,
): asserts start is number {
  if (start === null || start + size > limit) {
    throw new ZipRefused("malformed", "An entry of the zip runs past its end");
  }
}

export function checkedCrc(entry: Readonly<Pick<ZipEntry, "crc">>, computed: number): void {
  if (computed !== entry.crc) {
    throw new ZipRefused("bad-checksum", "An entry of the zip does not match its checksum");
  }
}

export async function bytesAt(
  source: Readonly<ZipSource>,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const bytes = await readExactly(source.read(offset, length), length);

  if (bytes === null) {
    throw new ZipRefused("malformed", "The zip ends before the bytes its records name");
  }

  return bytes;
}

export function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function wide(view: DataView, at: number): number {
  const value = view.getBigUint64(at, true);

  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ZipRefused("malformed", "A size or offset in the zip is too large");
  }

  return Number(value);
}

const NAMES = new TextEncoder();

export function localDataStart(
  bytes: Uint8Array,
  at: number,
  entry: Readonly<ZipEntry>,
): number | null {
  if (at < 0 || at + LOCAL_HEADER_BYTES > bytes.length) return null;

  const header = viewOf(bytes.subarray(at, at + LOCAL_HEADER_BYTES));

  if (header.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new ZipRefused("malformed", "A local header of the zip is malformed");
  }

  const name = NAMES.encode(entry.name);
  const nameEnd = at + LOCAL_HEADER_BYTES + name.length;

  if (header.getUint16(26, true) !== name.length) {
    throw new ZipRefused("malformed", "A local header of the zip names another entry");
  }

  if (nameEnd > bytes.length) return null;

  if (!name.every((byte, position) => bytes[at + LOCAL_HEADER_BYTES + position] === byte)) {
    throw new ZipRefused("malformed", "A local header of the zip names another entry");
  }

  return nameEnd + header.getUint16(28, true);
}

export async function entryStart(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<number> {
  const headerBytes = LOCAL_HEADER_BYTES + utf8Length(entry.name);
  const bytes = await bytesAt(source, entry.headerOffset, headerBytes);
  const start = localDataStart(bytes, 0, entry);
  const dataStart = start === null ? null : entry.headerOffset + start;

  checkedEnd(directory.offset, dataStart, entry.size);

  return dataStart;
}

export async function entryBytes(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<Uint8Array> {
  const bytes = await bytesAt(source, await entryStart(source, directory, entry), entry.size);

  checkedCrc(entry, crc32(bytes));

  return bytes;
}

export const LOCAL_HEADER_ROOM = LOCAL_HEADER_BYTES + 1024;

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

  checkedEnd(directory.offset, region.base + start, entry.size);

  const bytes =
    start + entry.size > region.bytes.length
      ? null
      : region.bytes.subarray(start, start + entry.size);

  if (bytes !== null) checkedCrc(entry, crc32(bytes));

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
