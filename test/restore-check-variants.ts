import { z } from "zod";

import type { RestoreRefusal } from "../src/core/contract/restore-contract.ts";
import {
  type Entries,
  directoryOf,
  nameEndingWith,
  rootOf,
  withEntry,
  withManifest,
  withoutEntry,
  zipOf,
} from "./zip-fixtures.ts";

const TEXT = new TextEncoder();

const RowSchema = z.record(z.string(), z.unknown());

const CENTRAL_METHOD_AT = 10;

const CENTRAL_CRC_AT = 16;

const LOCAL_HEADER_BYTES = 30;

type Variant = (entries: Entries, zip: Uint8Array) => Uint8Array | Promise<Uint8Array>;

const jsonLines = (entries: Entries, name: string) =>
  new TextDecoder().decode(entries.get(name)).split("\n");

const changedFirstLine = (entries: Entries, table: string, change: (row: string) => string) => {
  const name = nameEndingWith(entries, `/records/${table}.1.jsonl`);
  const [first = "", ...rest] = jsonLines(entries, name);

  return withEntry(entries, name, TEXT.encode([change(first), ...rest].join("\n")));
};

async function patched(
  zip: Uint8Array,
  change: (copy: Uint8Array, directory: Readonly<{ offset: number }>) => void,
): Promise<Uint8Array> {
  const directory = await directoryOf(zip);
  const copy = zip.slice();

  change(copy, directory);

  return copy;
}

export const VARIANTS: readonly (readonly [RestoreRefusal, string, Variant])[] = [
  ["not-a-zip", "bytes that are not a zip", () => TEXT.encode("this is plain text, not a zip")],
  ["not-a-zip", "a zip with its end record cut off", (_, zip) => zip.subarray(0, zip.length - 10)],
  [
    "unsupported-compression",
    "an entry that is not stored",
    (_, zip) =>
      patched(zip, (copy, { offset }) => {
        new DataView(copy.buffer).setUint16(offset + CENTRAL_METHOD_AT, 8, true);
      }),
  ],
  [
    "bad-entry-name",
    "an entry whose name climbs to a parent folder",
    (entries) =>
      zipOf(withEntry(entries, `${rootOf(entries)}items/../escape.md`, TEXT.encode("x"))),
  ],
  [
    "bad-entry-name",
    "an entry outside the one root folder",
    (entries) => zipOf(withEntry(entries, "elsewhere/file.md", TEXT.encode("x"))),
  ],
  [
    "no-manifest",
    "a zip with no manifest",
    (entries) => zipOf(withoutEntry(entries, nameEndingWith(entries, "/threadsift.json"))),
  ],
  [
    "format",
    "a manifest of another format",
    (entries) => zipOf(withManifest(entries, (manifest) => ({ ...manifest, format: 2 }))),
  ],
  [
    "format",
    "a manifest that is not JSON",
    (entries) =>
      zipOf(withEntry(entries, nameEndingWith(entries, "/threadsift.json"), TEXT.encode("{"))),
  ],
  [
    "format",
    "a manifest that leaves out a table",
    (entries) =>
      zipOf(
        withManifest(entries, (manifest) => ({
          ...manifest,
          tables: Object.fromEntries(
            Object.entries(manifest.tables).filter(([name]) => name !== "pins"),
          ),
        })),
      ),
  ],
  [
    "format",
    "a manifest that counts more rows than the record files hold",
    (entries) =>
      zipOf(
        withManifest(entries, (manifest) => ({
          ...manifest,
          tables: {
            ...manifest.tables,
            items: { files: manifest.tables["items"]?.files ?? [], rows: 99 },
          },
        })),
      ),
  ],
  [
    "format",
    "a manifest that lists a record file the zip lacks",
    (entries) => zipOf(withoutEntry(entries, nameEndingWith(entries, "/records/topics.1.jsonl"))),
  ],
  [
    "format",
    "a record file the manifest does not list",
    (entries) =>
      zipOf(withEntry(entries, `${rootOf(entries)}records/topics.2.jsonl`, TEXT.encode(""))),
  ],
  [
    "format",
    "a record line that is not an object",
    (entries) => zipOf(changedFirstLine(entries, "topics", () => "[1,2,3]")),
  ],
  [
    "other-release",
    "a manifest from another migration",
    (entries) =>
      zipOf(withManifest(entries, (manifest) => ({ ...manifest, migration: "0000_older.sql" }))),
  ],
  [
    "other-release",
    "a manifest with no migration",
    (entries) => zipOf(withManifest(entries, (manifest) => ({ ...manifest, migration: null }))),
  ],
  [
    "unknown-table",
    "a manifest that names a table this release does not restore",
    (entries) =>
      zipOf(
        withManifest(entries, (manifest) => ({
          ...manifest,
          tables: { ...manifest.tables, ghosts: { files: [], rows: 0 } },
        })),
      ),
  ],
  [
    "unknown-table",
    "a record file of a table this release does not restore",
    (entries) =>
      zipOf(withEntry(entries, `${rootOf(entries)}records/ghosts.1.jsonl`, TEXT.encode(""))),
  ],
  [
    "unknown-column",
    "a record with a column the table lacks",
    (entries) =>
      zipOf(changedFirstLine(entries, "topics", (row) => row.replace(/\}$/u, ',"bogus":1}'))),
  ],
  [
    "missing-column",
    "a record that lacks a column of the table",
    (entries) =>
      zipOf(
        changedFirstLine(entries, "topics", (row) =>
          JSON.stringify(
            Object.fromEntries(Object.entries(RowSchema.parse(JSON.parse(row))).slice(1)),
          ),
        ),
      ),
  ],
  [
    "crc",
    "a note whose bytes changed after the checksum was written",
    (entries, zip) =>
      patched(zip, (copy, directory) => {
        const note = [...entries.keys()].findIndex((name) => name.includes("/items/1/note-"));
        const at = readEntryStart(copy, directory.offset, note);

        copy[at] = (copy[at] ?? 0) ^ 0xff;
      }),
  ],
  [
    "crc",
    "a record file whose stored checksum is wrong",
    (_, zip) =>
      patched(zip, (copy, { offset }) => {
        new DataView(copy.buffer).setUint32(offset + CENTRAL_CRC_AT, 12_345, true);
      }),
  ],
];

function readEntryStart(zip: Uint8Array, directoryOffset: number, index: number): number {
  const view = new DataView(zip.buffer);
  const at = Array.from({ length: index }).reduce<number>(
    (position) =>
      position +
      46 +
      view.getUint16(position + 28, true) +
      view.getUint16(position + 30, true) +
      view.getUint16(position + 32, true),
    directoryOffset,
  );

  const local = view.getUint32(at + 42, true);

  return (
    local + LOCAL_HEADER_BYTES + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
  );
}
