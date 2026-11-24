import assert from "node:assert/strict";

import { z } from "zod";

import { RESTORE_DIRECTORY_BYTES } from "../src/core/contract/restore-contract.ts";
import { readDirectory } from "../src/features/export/core/zip-directory.ts";
import { type ZipSource, entryBytes } from "../src/features/export/core/zip-read.ts";
import {
  type ZipFile,
  dosTimeOf,
  endOfArchive,
  joined,
  packFiles,
} from "../src/features/export/core/zip.ts";

const TEXT = new TextEncoder();

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

  return joined([
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
