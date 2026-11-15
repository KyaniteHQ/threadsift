import { crc32 } from "node:zlib";

const END_SIGNATURE = 0x06_05_4b_50;

const CENTRAL_SIGNATURE = 0x02_01_4b_50;

const LOCAL_SIGNATURE = 0x04_03_4b_50;

const END_BYTES = 22;

const CENTRAL_BYTES = 46;

const LOCAL_BYTES = 30;

const STORE_METHOD = 0;

function endOffset(view: DataView): number {
  for (let at = view.byteLength - END_BYTES; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === END_SIGNATURE) return at;
  }

  throw new Error("The file has no end of central directory");
}

export function readStoredZip(bytes: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endOffset(view);
  const count = view.getUint16(end + 10, true);
  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  let record = view.getUint32(end + 16, true);

  for (let entry = 0; entry < count; entry += 1) {
    if (view.getUint32(record, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`Central record ${String(entry)} is malformed`);
    }

    if (view.getUint16(record + 10, true) !== STORE_METHOD) {
      throw new Error(`Entry ${String(entry)} is not stored`);
    }

    const size = view.getUint32(record + 24, true);
    const nameLength = view.getUint16(record + 28, true);
    const extraLength = view.getUint16(record + 30, true);
    const commentLength = view.getUint16(record + 32, true);
    const local = view.getUint32(record + 42, true);

    const name = decoder.decode(
      bytes.subarray(record + CENTRAL_BYTES, record + CENTRAL_BYTES + nameLength),
    );

    if (view.getUint32(local, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Local header of ${name} is malformed`);
    }

    const start =
      local + LOCAL_BYTES + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);

    const data = bytes.subarray(start, start + size);

    if (crc32(data) !== view.getUint32(record + 16, true)) {
      throw new Error(`The CRC-32 of ${name} does not match its data`);
    }

    entries.set(name, data);
    record += CENTRAL_BYTES + nameLength + extraLength + commentLength;
  }

  return entries;
}
