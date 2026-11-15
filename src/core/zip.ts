import { crc32 } from "./crc32.ts";

export const ZIP_COUNT_LIMIT = 0xff_ff;

export const ZIP_SIZE_LIMIT = 0xff_ff_ff_ff;

const UTF8_NAME_FLAG = 0x08_00;

const STORE_METHOD = 0;

const VERSION_PLAIN = 20;

const VERSION_ZIP64 = 45;

const UNIX_HOST = 3;

const REGULAR_FILE_MODE = 0o100_644;

const LOCAL_HEADER_BYTES = 30;

const CENTRAL_RECORD_BYTES = 46;

const ZIP64_OFFSET_FIELD_BYTES = 12;

const ZIP64_END_BYTES = 56;

const ZIP64_LOCATOR_BYTES = 20;

const END_BYTES = 22;

const ZIP64_EXTRA_ID = 0x00_01;

const MINIMUM_YEAR = 1980;

const NAMES = new TextEncoder();

export interface ZipFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface PackedFiles {
  readonly data: Uint8Array;
  readonly directory: Uint8Array;
}

export interface DosTime {
  readonly time: number;
  readonly date: number;
}

export function dosTimeOf(milliseconds: number): DosTime {
  const moment = new Date(Math.max(milliseconds, Date.UTC(MINIMUM_YEAR, 0, 1)));

  return {
    time:
      (moment.getUTCHours() << 11) |
      (moment.getUTCMinutes() << 5) |
      Math.floor(moment.getUTCSeconds() / 2),
    date:
      ((moment.getUTCFullYear() - MINIMUM_YEAR) << 9) |
      ((moment.getUTCMonth() + 1) << 5) |
      moment.getUTCDate(),
  };
}

function viewOf(length: number) {
  const bytes = new Uint8Array(length);

  return { bytes, view: new DataView(bytes.buffer) };
}

function localHeader(name: Uint8Array, bytes: Uint8Array, crc: number, dos: DosTime): Uint8Array {
  const { bytes: header, view } = viewOf(LOCAL_HEADER_BYTES + name.length);

  view.setUint32(0, 0x04_03_4b_50, true);
  view.setUint16(4, VERSION_PLAIN, true);
  view.setUint16(6, UTF8_NAME_FLAG, true);
  view.setUint16(8, STORE_METHOD, true);
  view.setUint16(10, dos.time, true);
  view.setUint16(12, dos.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, bytes.length, true);
  view.setUint32(22, bytes.length, true);
  view.setUint16(26, name.length, true);
  header.set(name, LOCAL_HEADER_BYTES);

  return header;
}

function centralRecord(
  name: Uint8Array,
  { size, crc, offset, dos }: Readonly<{ size: number; crc: number; offset: number; dos: DosTime }>,
): Uint8Array {
  const wide = offset >= ZIP_SIZE_LIMIT;
  const extraBytes = wide ? ZIP64_OFFSET_FIELD_BYTES : 0;
  const { bytes: record, view } = viewOf(CENTRAL_RECORD_BYTES + name.length + extraBytes);

  view.setUint32(0, 0x02_01_4b_50, true);
  view.setUint16(4, (UNIX_HOST << 8) | VERSION_ZIP64, true);
  view.setUint16(6, wide ? VERSION_ZIP64 : VERSION_PLAIN, true);
  view.setUint16(8, UTF8_NAME_FLAG, true);
  view.setUint16(10, STORE_METHOD, true);
  view.setUint16(12, dos.time, true);
  view.setUint16(14, dos.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, extraBytes, true);
  view.setUint32(38, (REGULAR_FILE_MODE << 16) >>> 0, true);
  view.setUint32(42, wide ? ZIP_SIZE_LIMIT : offset, true);
  record.set(name, CENTRAL_RECORD_BYTES);

  if (wide) {
    const extra = CENTRAL_RECORD_BYTES + name.length;

    view.setUint16(extra, ZIP64_EXTRA_ID, true);
    view.setUint16(extra + 2, 8, true);
    view.setBigUint64(extra + 4, BigInt(offset), true);
  }

  return record;
}

export function joined(parts: readonly Uint8Array[]): Uint8Array {
  const joinedBytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));

  parts.reduce((at, part) => {
    joinedBytes.set(part, at);

    return at + part.length;
  }, 0);

  return joinedBytes;
}

export function packFiles(
  files: readonly ZipFile[],
  { offset, dos }: Readonly<{ offset: number; dos: DosTime }>,
): PackedFiles {
  const data: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let position = offset;

  for (const { name, bytes } of files) {
    const encoded = NAMES.encode(name);
    const crc = crc32(bytes);
    const header = localHeader(encoded, bytes, crc, dos);

    directory.push(centralRecord(encoded, { size: bytes.length, crc, offset: position, dos }));
    data.push(header, bytes);
    position += header.length + bytes.length;
  }

  return { data: joined(data), directory: joined(directory) };
}

export interface ArchiveEnd {
  readonly entries: number;
  readonly directoryOffset: number;
  readonly directorySize: number;
}

export function needsZip64({ entries, directoryOffset, directorySize }: Readonly<ArchiveEnd>) {
  return (
    entries >= ZIP_COUNT_LIMIT ||
    directoryOffset >= ZIP_SIZE_LIMIT ||
    directorySize >= ZIP_SIZE_LIMIT
  );
}

export function endOfArchive(end: Readonly<ArchiveEnd>): Uint8Array {
  const wide = needsZip64(end);
  const { bytes, view } = viewOf(END_BYTES + (wide ? ZIP64_END_BYTES + ZIP64_LOCATOR_BYTES : 0));
  const classic = wide ? ZIP64_END_BYTES + ZIP64_LOCATOR_BYTES : 0;

  if (wide) {
    view.setUint32(0, 0x06_06_4b_50, true);
    view.setBigUint64(4, BigInt(ZIP64_END_BYTES - 12), true);
    view.setUint16(12, (UNIX_HOST << 8) | VERSION_ZIP64, true);
    view.setUint16(14, VERSION_ZIP64, true);
    view.setBigUint64(24, BigInt(end.entries), true);
    view.setBigUint64(32, BigInt(end.entries), true);
    view.setBigUint64(40, BigInt(end.directorySize), true);
    view.setBigUint64(48, BigInt(end.directoryOffset), true);
    view.setUint32(ZIP64_END_BYTES, 0x07_06_4b_50, true);
    view.setBigUint64(ZIP64_END_BYTES + 8, BigInt(end.directoryOffset + end.directorySize), true);
    view.setUint32(ZIP64_END_BYTES + 16, 1, true);
  }

  view.setUint32(classic, 0x06_05_4b_50, true);
  view.setUint16(classic + 8, Math.min(end.entries, ZIP_COUNT_LIMIT), true);
  view.setUint16(classic + 10, Math.min(end.entries, ZIP_COUNT_LIMIT), true);
  view.setUint32(classic + 12, Math.min(end.directorySize, ZIP_SIZE_LIMIT), true);
  view.setUint32(classic + 16, Math.min(end.directoryOffset, ZIP_SIZE_LIMIT), true);

  return bytes;
}
