import { restorePartKey } from "./file-keys.ts";
import type { FileStore } from "./file-store.ts";
import { partLength } from "./restore-contract.ts";
import { ZipRefused, type ZipSource } from "./zip-read.ts";

export interface UploadedZip {
  readonly id: number;
  readonly bytes: number;
  readonly partBytes: number;
}

async function* sliced(
  body: ReadableStream<Uint8Array>,
  from: number,
  count: number,
): AsyncGenerator<Uint8Array> {
  let skipped = 0;
  let given = 0;

  for await (const chunk of body) {
    const start = Math.max(from - skipped, 0);

    skipped += chunk.length;

    if (start < chunk.length) {
      const piece = chunk.subarray(start, start + count - given);

      given += piece.length;
      yield piece;
    }

    if (given === count) return;
  }

  throw new ZipRefused("incomplete-upload", "An uploaded part is shorter than it was announced");
}

async function* readFrom(
  files: Pick<FileStore, "get">,
  zip: Readonly<UploadedZip>,
  { at, end }: Readonly<{ at: number; end: number }>,
): AsyncGenerator<Uint8Array> {
  if (at >= end) return;

  const part = Math.floor(at / zip.partBytes) + 1;
  const within = at - (part - 1) * zip.partBytes;
  const take = Math.min(end - at, partLength(zip, part) - within);
  const body = await files.get(restorePartKey(zip.id, part));

  if (body === null) throw new ZipRefused("incomplete-upload", "An uploaded part is missing");

  yield* sliced(body, within, take);
  yield* readFrom(files, zip, { at: at + take, end });
}

export function partSource(files: Pick<FileStore, "get">, zip: Readonly<UploadedZip>): ZipSource {
  return {
    size: zip.bytes,
    read: (offset, length) => readFrom(files, zip, { at: offset, end: offset + length }),
  };
}
