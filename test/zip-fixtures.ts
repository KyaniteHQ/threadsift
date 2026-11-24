import assert from "node:assert/strict";

import { z } from "zod";

import { joinedBytes, utf8Length } from "../src/core/contract/encoding.ts";
import { RESTORE_DIRECTORY_BYTES } from "../src/core/contract/restore-contract.ts";
import { readDirectory } from "../src/features/export/core/zip-directory.ts";
import {
  type ZipDirectory,
  type ZipEntry,
  type ZipSource,
  entryBytes,
} from "../src/features/export/core/zip-read.ts";
import {
  CENTRAL_RECORD_BYTES,
  LOCAL_HEADER_BYTES,
  type ZipFile,
  dosTimeOf,
  endOfArchive,
  packFiles,
} from "../src/features/export/core/zip.ts";

export const TEXT = new TextEncoder();

const ManifestSchema = z.looseObject({
  format: z.number(),
  migration: z.string().nullable(),
  tables: z.record(z.string(), z.object({ files: z.array(z.string()), rows: z.number() })),
  sequences: z.record(z.string(), z.number()),
  openItems: z.number(),
});

type Manifest = z.infer<typeof ManifestSchema>;

export type Entries = ReadonlyMap<string, Uint8Array>;

export function sourceOf(bytes: Uint8Array): ZipSource {
  return {
    size: bytes.length,
    read: async function* read(offset, length) {
      yield await Promise.resolve(bytes.subarray(offset, offset + length));
    },
  };
}

export function directoryOf(bytes: Uint8Array) {
  return readDirectory(sourceOf(bytes), RESTORE_DIRECTORY_BYTES);
}

export const dataStartOf = (entry: Readonly<ZipEntry>): number =>
  entry.headerOffset + LOCAL_HEADER_BYTES + utf8Length(entry.name);

const CENTRAL_NAME_LENGTH_AT = 28;

export function centralRecordOf(
  zip: Uint8Array,
  directory: Readonly<ZipDirectory>,
  entry: Readonly<ZipEntry>,
) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  return directory.entries
    .slice(0, directory.entries.indexOf(entry))
    .reduce(
      (at) =>
        at +
        CENTRAL_RECORD_BYTES +
        view.getUint16(at + CENTRAL_NAME_LENGTH_AT, true) +
        view.getUint16(at + CENTRAL_NAME_LENGTH_AT + 2, true) +
        view.getUint16(at + CENTRAL_NAME_LENGTH_AT + 4, true),
      directory.offset,
    );
}

export function entryMatching(directory: Readonly<ZipDirectory>, part: string): ZipEntry {
  const found = directory.entries.find(({ name }) => name.includes(part));

  assert.ok(found !== undefined, `the zip holds an entry with ${part} in its name`);

  return found;
}

export async function entriesOf(bytes: Uint8Array): Promise<Entries> {
  const source = sourceOf(bytes);
  const directory = await directoryOf(bytes);

  const read = await Promise.all(
    directory.entries.map(
      async (entry) => [entry.name, await entryBytes(source, directory, entry)] as const,
    ),
  );

  return new Map(read);
}

export const ZIP_DOS = dosTimeOf(Date.UTC(2026, 10, 24));

export function zipOfFiles(files: readonly ZipFile[]): Uint8Array {
  const packed = packFiles(files, { offset: 0, dos: ZIP_DOS });

  return joinedBytes([
    packed.data,
    packed.directory,
    endOfArchive({
      entries: files.length,
      directoryOffset: packed.data.length,
      directorySize: packed.directory.length,
    }),
  ]);
}

export function zipOf(entries: Entries): Uint8Array {
  return zipOfFiles([...entries].map(([name, bytes]) => ({ name, bytes })));
}

export function nameEndingWith(entries: Entries, ending: string): string {
  const found = [...entries.keys()].find((name) => name.endsWith(ending));

  assert.ok(found !== undefined, `the zip holds an entry ending ${ending}`);

  return found;
}

export function rootOf(entries: Entries): string {
  return nameEndingWith(entries, "/threadsift.json").slice(0, -"threadsift.json".length);
}

export function manifestOf(entries: Entries): Manifest {
  const bytes = entryOf(entries, nameEndingWith(entries, "/threadsift.json"));

  return ManifestSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}

export function withEntry(entries: Entries, name: string, bytes: Uint8Array): Entries {
  return new Map([...entries, [name, bytes]]);
}

export function withoutEntry(entries: Entries, name: string): Entries {
  return new Map([...entries].filter(([each]) => each !== name));
}

export function withManifest(entries: Entries, change: (manifest: Manifest) => Manifest): Entries {
  const name = nameEndingWith(entries, "/threadsift.json");
  const changed = change(manifestOf(entries));

  return withEntry(entries, name, TEXT.encode(`${JSON.stringify(changed, null, 2)}\n`));
}

export function entryOf(entries: Entries, name: string): Uint8Array {
  const bytes = entries.get(name);

  assert.ok(bytes !== undefined, `the zip holds ${name}`);

  return bytes;
}

export function linesOf(bytes: Uint8Array): readonly string[] {
  return new TextDecoder()
    .decode(bytes)
    .split("\n")
    .filter((line) => line !== "");
}

export function recordLines(entries: Entries, table: string): readonly string[] {
  const root = rootOf(entries);

  return (manifestOf(entries).tables[table]?.files ?? []).flatMap((file) =>
    linesOf(entryOf(entries, `${root}${file}`)),
  );
}

export function withRecordLines(
  entries: Entries,
  table: string,
  change: (lines: readonly string[]) => readonly string[],
): Entries {
  const name = nameEndingWith(entries, `/records/${table}.1.jsonl`);
  const old = linesOf(entryOf(entries, name));
  const lines = change(old);
  const next = withEntry(entries, name, TEXT.encode(lines.map((line) => `${line}\n`).join("")));

  return withManifest(next, (manifest) => ({
    ...manifest,
    tables: {
      ...manifest.tables,
      [table]: {
        files: manifest.tables[table]?.files ?? [],
        rows: (manifest.tables[table]?.rows ?? 0) + lines.length - old.length,
      },
    },
  }));
}
