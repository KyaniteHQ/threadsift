import { restorePartKey } from "../../../core/contract/file-keys.ts";
import { RESTORE_DIRECTORY_BYTES, partLength } from "../../../core/contract/restore-contract.ts";
import type { FileStore } from "../../../core/kernel/file-store.ts";
import type { Manifest } from "../../export/core/export-format.ts";
import { readDirectory } from "../../export/core/zip-directory.ts";
import type { ZipDirectory, ZipSource } from "../../export/core/zip-read.ts";
import { RestoreRefused } from "./restore-refusal.ts";

export interface Release {
  readonly directory: ZipDirectory;
  readonly manifest: Manifest;
}

interface UploadedZip {
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

  throw new RestoreRefused(
    "incomplete-upload",
    "An uploaded part is shorter than it was announced",
  );
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

  if (body === null) throw new RestoreRefused("incomplete-upload", "An uploaded part is missing");

  yield* sliced(body, within, take);
  yield* readFrom(files, zip, { at: at + take, end });
}

export function partSource(files: Pick<FileStore, "get">, zip: Readonly<UploadedZip>): ZipSource {
  return {
    size: zip.bytes,
    read: (offset, length) => readFrom(files, zip, { at: offset, end: offset + length }),
  };
}

export function readRestoreDirectory(source: Readonly<ZipSource>): Promise<ZipDirectory> {
  return readDirectory(source, RESTORE_DIRECTORY_BYTES);
}
