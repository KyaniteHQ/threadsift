import { z } from "zod";

import { EXPORT_FORMAT } from "./export-contract.ts";
import { recordPath, recordTableOf } from "./export-manifest.ts";
import { RESTORE_MANIFEST_BYTES, type RestoreRefusal } from "./restore-contract.ts";
import { parsedJsonBytes } from "./restore-lines.ts";
import { RESTORE_TABLES, tableSpec } from "./restore-registry.ts";
import { WholeCount } from "./whole-count.ts";
import { type ZipDirectory, ZipRefused, type ZipSource, entryBytes } from "./zip-read.ts";

const ManifestSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    migration: z.string().nullable(),
    tables: z
      .record(
        z.string(),
        z.object({ files: z.array(z.string()).readonly(), rows: WholeCount }).readonly(),
      )
      .readonly(),
    sequences: z.record(z.string(), WholeCount).readonly(),
  })
  .readonly();

export type Manifest = z.infer<typeof ManifestSchema>;

const MANIFEST_NAME = "threadsift.json";

export function refused(code: RestoreRefusal, message: string): ZipRefused {
  return new ZipRefused(code, message);
}

function manifestOf(bytes: Uint8Array): Manifest {
  const manifest = parsedJsonBytes(ManifestSchema, bytes);

  if (manifest === null) throw refused("format", "The manifest is not in the export format");

  return manifest;
}

export async function readManifest(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
): Promise<Manifest> {
  const entry = directory.entries.find(({ name }) => name === `${directory.root}/${MANIFEST_NAME}`);

  if (entry === undefined) throw refused("no-manifest", "The zip has no manifest");

  if (entry.size > RESTORE_MANIFEST_BYTES) throw refused("format", "The manifest is too large");

  return manifestOf(await entryBytes(source, directory, entry));
}

function known(name: string): boolean {
  return tableSpec(name) !== undefined;
}

function checkedManifest(manifest: Readonly<Manifest>): void {
  if (RESTORE_TABLES.some((name) => manifest.tables[name] === undefined)) {
    throw refused("format", "The manifest leaves out a table of the export format");
  }

  if (!Object.keys(manifest.tables).every((name) => known(name))) {
    throw refused("unknown-table", "The manifest names a table this release does not restore");
  }

  for (const [table, { files }] of Object.entries(manifest.tables)) {
    if (files.some((file, at) => file !== recordPath(table, at + 1))) {
      throw refused("format", "The manifest lists record files the format does not name");
    }
  }
}

function checkedEntries(manifest: Readonly<Manifest>, directory: Readonly<ZipDirectory>): void {
  const listed = new Set(
    Object.values(manifest.tables).flatMap(({ files }) =>
      files.map((file) => `${directory.root}/${file}`),
    ),
  );

  for (const { name } of directory.entries) {
    const table = recordTableOf(directory, name);

    if (table !== null && !name.endsWith("/")) {
      if (!known(table)) {
        throw refused(
          "unknown-table",
          "The zip holds a record file of a table this release does not restore",
        );
      }

      if (!listed.has(name)) {
        throw refused("format", "The zip holds a record file the manifest does not list");
      }
    }
  }

  for (const name of listed) {
    if (!directory.entries.some((entry) => entry.name === name)) {
      throw refused("format", "The manifest lists a record file the zip does not hold");
    }
  }
}

export function checkedTables(
  manifest: Readonly<Manifest>,
  directory: Readonly<ZipDirectory>,
): void {
  checkedManifest(manifest);
  checkedEntries(manifest, directory);
}
