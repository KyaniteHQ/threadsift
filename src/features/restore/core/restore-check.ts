import { RESTORE_MANIFEST_BYTES } from "../../../core/contract/restore-contract.ts";
import {
  type Manifest,
  ManifestSchema,
  manifestName,
  recordPath,
  recordTableOf,
} from "../../export/core/export-format.ts";
import { type ZipDirectory, type ZipSource, entryBytes } from "../../export/core/zip-read.ts";
import { parsedJsonBytes } from "./restore-lines.ts";
import { RestoreRefused } from "./restore-refusal.ts";
import { RESTORE_TABLES, tableSpec } from "./restore-registry.ts";

function manifestOf(bytes: Uint8Array): Manifest {
  const manifest = parsedJsonBytes(ManifestSchema, bytes);

  if (manifest === null)
    throw new RestoreRefused("format", "The manifest is not in the export format");

  return manifest;
}

export async function readManifest(
  source: Readonly<ZipSource>,
  directory: Readonly<ZipDirectory>,
): Promise<Manifest> {
  const entry = directory.entries.find(({ name }) => name === manifestName(directory.root));

  if (entry === undefined) throw new RestoreRefused("no-manifest", "The zip has no manifest");

  if (entry.size > RESTORE_MANIFEST_BYTES)
    throw new RestoreRefused("format", "The manifest is too large");

  return manifestOf(await entryBytes(source, directory, entry));
}

function known(name: string): boolean {
  return tableSpec(name) !== undefined;
}

function checkedManifest(manifest: Readonly<Manifest>): void {
  if (RESTORE_TABLES.some((name) => manifest.tables[name] === undefined)) {
    throw new RestoreRefused("format", "The manifest leaves out a table of the export format");
  }

  if (!Object.keys(manifest.tables).every((name) => known(name))) {
    throw new RestoreRefused(
      "unknown-table",
      "The manifest names a table this release does not restore",
    );
  }

  for (const [table, { files }] of Object.entries(manifest.tables)) {
    if (files.some((file, at) => file !== recordPath(table, at + 1))) {
      throw new RestoreRefused(
        "format",
        "The manifest lists record files the format does not name",
      );
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
        throw new RestoreRefused(
          "unknown-table",
          "The zip holds a record file of a table this release does not restore",
        );
      }

      if (!listed.has(name)) {
        throw new RestoreRefused(
          "format",
          "The zip holds a record file the manifest does not list",
        );
      }
    }
  }

  for (const name of listed) {
    if (!directory.entries.some((entry) => entry.name === name)) {
      throw new RestoreRefused("format", "The manifest lists a record file the zip does not hold");
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
