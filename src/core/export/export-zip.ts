import { tallyOf } from "../contract/export-contract.ts";
import { type ExportPiece, exportPieceKey, exportTailKey } from "../contract/file-keys.ts";
import type { ExportRow } from "../kernel/schema.ts";
import type { BuiltSlice } from "./export-slice.ts";
import { dosTimeOf, endOfArchive, packFiles } from "./zip.ts";

export interface PackedSlice {
  readonly objects: readonly Readonly<{ key: string; bytes: Uint8Array }>[];
  readonly entries: number;
  readonly dataBytes: number;
  readonly dirBytes: number;
  readonly tailBytes: number | null;
}

export function packedSlice(
  run: Readonly<ExportRow>,
  slice: Readonly<Pick<BuiltSlice, "files" | "finished">>,
  generation: number,
): PackedSlice {
  const packed = packFiles(slice.files, { offset: run.dataBytes, dos: dosTimeOf(run.createdAt) });
  const part = run.parts + 1;
  const entries = run.entries + slice.files.length;
  const dataBytes = run.dataBytes + packed.data.length;
  const dirBytes = run.dirBytes + packed.directory.length;

  const tail = slice.finished
    ? endOfArchive({ entries, directoryOffset: dataBytes, directorySize: dirBytes })
    : null;

  return {
    objects: [
      { key: exportPieceKey(run.id, "part", part, generation), bytes: packed.data },
      { key: exportPieceKey(run.id, "dir", part, generation), bytes: packed.directory },
      ...(tail === null ? [] : [{ key: exportTailKey(run.id, generation), bytes: tail }]),
    ],
    entries,
    dataBytes,
    dirBytes,
    tailBytes: tail?.length ?? null,
  };
}

export function zipSize(
  run: Readonly<Pick<ExportRow, "dataBytes" | "dirBytes" | "tailBytes">>,
): number {
  return run.dataBytes + run.dirBytes + run.tailBytes;
}

interface StoredZip {
  readonly keys: readonly string[];
  readonly size: number;
}

export function storedZip(
  run: Readonly<Pick<ExportRow, "id" | "tally" | "dataBytes" | "dirBytes" | "tailBytes">>,
): StoredZip | null {
  const { generations } = tallyOf(run);
  const tail = generations.at(-1);

  if (tail === undefined) return null;

  const named = (piece: ExportPiece) =>
    generations.map((generation, at) => exportPieceKey(run.id, piece, at + 1, generation));

  return {
    keys: [...named("part"), ...named("dir"), exportTailKey(run.id, tail)],
    size: zipSize(run),
  };
}
