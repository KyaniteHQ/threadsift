import { utf8Length } from "../contract/encoding.ts";
import { readExactly } from "../kernel/capped.ts";
import { crc32 } from "./crc32.ts";
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

function localDataStart(bytes: Uint8Array, at: number, entry: Readonly<ZipEntry>): number | null {
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

export interface ZipSpan {
  readonly start: number;
  readonly end: number;
}

export interface ZipRegion {
  readonly bytes: Uint8Array;
  readonly base: number;
}

export async function entrySpan(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<ZipSpan> {
  const headerBytes = LOCAL_HEADER_BYTES + utf8Length(entry.name);
  const bytes = await bytesAt(source, entry.headerOffset, headerBytes);
  const start = localDataStart(bytes, 0, entry);
  const dataStart = start === null ? null : entry.headerOffset + start;

  checkedEnd(directory.offset, dataStart, entry.size);

  return { start: dataStart, end: dataStart + entry.size };
}

export function spanIn(
  { bytes, base }: Readonly<ZipRegion>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
  consumed: number,
): ZipSpan | null {
  const header = consumed === 0 ? localDataStart(bytes, entry.headerOffset - base, entry) : 0;

  if (header === null) return null;

  checkedEnd(directory.offset, base + header, entry.size - consumed);

  return header > bytes.length
    ? null
    : { start: base + header, end: base + header + entry.size - consumed };
}

export async function entryBytes(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Promise<Uint8Array> {
  const bytes = await bytesAt(
    source,
    (await entrySpan(source, directory, entry)).start,
    entry.size,
  );

  checkedCrc(entry, crc32(bytes));

  return bytes;
}

const LOCAL_HEADER_ROOM = LOCAL_HEADER_BYTES + 1024;

export interface ReadEntry {
  readonly entry: ZipEntry;
  readonly bytes: Uint8Array;
}

export interface ReadExtent {
  readonly from: number;
  readonly to: number;
}

export function extentWith(
  extent: Readonly<ReadExtent> | null,
  entry: Readonly<ZipEntry>,
): ReadExtent {
  const to = entry.headerOffset + LOCAL_HEADER_ROOM + entry.size;

  return extent === null
    ? { from: entry.headerOffset, to }
    : { from: Math.min(extent.from, entry.headerOffset), to: Math.max(extent.to, to) };
}

function sliceOf(
  region: Readonly<ZipRegion>,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
): Uint8Array | null {
  const span = spanIn(region, directory, entry, 0);

  if (span === null || span.end > region.base + region.bytes.length) return null;

  const bytes = region.bytes.subarray(span.start - region.base, span.end - region.base);

  checkedCrc(entry, crc32(bytes));

  return bytes;
}

export async function entriesBytes(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
  entries: readonly ZipEntry[],
): Promise<readonly ReadEntry[]> {
  const extent = entries.reduce<ReadExtent | null>(
    (grown, entry) => extentWith(grown, entry),
    null,
  );

  if (extent === null) return [];

  const end = Math.min(directory.offset, extent.to);
  const region = {
    bytes: await bytesAt(source, extent.from, Math.max(end - extent.from, 0)),
    base: extent.from,
  };

  return Promise.all(
    entries.map(async (entry) => ({
      entry,
      bytes: sliceOf(region, directory, entry) ?? (await entryBytes(source, directory, entry)),
    })),
  );
}
