import { crc32, inflateRawSync } from "node:zlib";

type ZipData = Readonly<Pick<Buffer, "length" | "readUInt32LE" | "readUInt16LE" | "subarray">>;

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function directoryEnd(zip: ZipData): number {
  const minimum = Math.max(0, zip.length - 22 - 65535);

  for (let offset = zip.length - 22; offset >= minimum; offset -= 1) {
    if (
      zip.readUInt32LE(offset) === END_SIGNATURE &&
      offset + 22 + zip.readUInt16LE(offset + 20) === zip.length
    )
      return offset;
  }

  throw new Error("ZIP end record missing or truncated");
}

function entryBytes(zip: ZipData, offset: number, directory: number): Buffer {
  const method = zip.readUInt16LE(offset + 10);
  const compressed = zip.readUInt32LE(offset + 20);
  const size = zip.readUInt32LE(offset + 24);
  const local = zip.readUInt32LE(offset + 42);

  if (
    zip.readUInt16LE(offset + 34) !== 0 ||
    (zip.readUInt16LE(offset + 8) & 1) !== 0 ||
    [compressed, size, local].includes(0xffffffff)
  )
    throw new Error("Split, encrypted and ZIP64 entries are unsupported");

  if (zip.readUInt32LE(local) !== LOCAL_SIGNATURE || zip.readUInt16LE(local + 8) !== method)
    throw new Error("ZIP local header disagrees with directory");
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);

  if (start + compressed > directory) throw new Error("ZIP entry exceeds data section");
  const input = zip.subarray(start, start + compressed);
  let bytes: Buffer;

  switch (method) {
    case 0:
      bytes = input;
      break;
    case 8:
      bytes = inflateRawSync(input, { maxOutputLength: Math.max(1, size) });
      break;
    default:
      throw new Error(`Unsupported ZIP compression method ${String(method)}`);
  }

  if (bytes.length !== size || crc32(bytes) !== zip.readUInt32LE(offset + 16))
    throw new Error("ZIP entry size or checksum mismatch");

  return bytes;
}

export function zipEntries(input: Uint8Array): readonly Buffer[] {
  const zip = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const end = directoryEnd(zip);
  const count = zip.readUInt16LE(end + 10);
  const size = zip.readUInt32LE(end + 12);
  const directory = zip.readUInt32LE(end + 16);

  if (
    zip.readUInt16LE(end + 4) !== 0 ||
    zip.readUInt16LE(end + 6) !== 0 ||
    zip.readUInt16LE(end + 8) !== count ||
    count === 65535 ||
    directory === 0xffffffff ||
    directory + size !== end
  )
    throw new Error("Split, ZIP64 or inconsistent ZIP directory");
  const entries: Buffer[] = [];
  let offset = directory;

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > end || zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new Error("Invalid ZIP directory entry");
    entries.push(entryBytes(zip, offset, directory));
    offset +=
      46 +
      zip.readUInt16LE(offset + 28) +
      zip.readUInt16LE(offset + 30) +
      zip.readUInt16LE(offset + 32);
  }

  if (offset !== end) throw new Error("ZIP directory length mismatch");

  return entries;
}
