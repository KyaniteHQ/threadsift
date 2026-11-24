import assert from "node:assert/strict";

import { z } from "zod";

import type { RestoreRefusal } from "../src/core/contract/restore-contract.ts";
import type { ZipDirectory } from "../src/features/export/core/zip-read.ts";
import {
  type Entries,
  centralRecordOf,
  dataStartOf,
  directoryOf,
  entryMatching,
  nameEndingWith,
  rootOf,
  withEntry,
  withManifest,
  withRecordLines,
  withoutEntry,
  zipOf,
  zipOfFiles,
  TEXT,
} from "./zip-fixtures.ts";

const RowSchema = z.record(z.string(), z.unknown());

const CENTRAL_METHOD_AT = 10;

const CENTRAL_CRC_AT = 16;

type Variant = (entries: Entries, zip: Uint8Array) => Uint8Array | Promise<Uint8Array>;

const changedFirstLine = (entries: Entries, table: string, change: (row: string) => string) =>
  withRecordLines(entries, table, ([first = "", ...rest]) => [change(first), ...rest]);

const BAD_NAMES: readonly (readonly [string, readonly string[]])[] = [
  ["an absolute name", ["/root/a.txt"]],
  ["an empty segment", ["root//a.txt"]],
  ["a backslash", ["root/a\\b.txt"]],
  ["a NUL character", ["root/a\0b.txt"]],
  ["a dot segment", ["root/./a.txt"]],
  ["two root folders", ["root/a.txt", "other/b.txt"]],
  ["an entry outside any folder", ["a.txt"]],
  ["a name used twice", ["root/a.txt", "root/a.txt"]],
];

const zipNamed = (names: readonly string[]) =>
  zipOfFiles(names.map((name) => ({ name, bytes: TEXT.encode(name) })));

function zipWithRawName(): Uint8Array {
  const zip = zipNamed(["root/aa"]);
  const name = TEXT.encode("root/aa");

  for (let at = 0; at + name.length <= zip.length; at += 1) {
    if (name.every((byte, position) => zip[at + position] === byte)) {
      zip[at + name.length - 2] = 0xff;
      zip[at + name.length - 1] = 0xfe;
    }
  }

  return zip;
}

async function patched(
  zip: Uint8Array,
  change: (copy: Uint8Array, directory: Readonly<ZipDirectory>) => void,
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
      patched(zip, (copy, directory) => {
        const [first] = directory.entries;

        assert.ok(first !== undefined);
        new DataView(copy.buffer).setUint16(
          centralRecordOf(copy, directory, first) + CENTRAL_METHOD_AT,
          8,
          true,
        );
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
  ...BAD_NAMES.map(([name, names]): readonly [RestoreRefusal, string, Variant] => [
    "bad-entry-name",
    `${name} in the directory`,
    () => zipNamed(names),
  ]),
  ["bad-entry-name", "a name that is not UTF-8", zipWithRawName],
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
    (_, zip) =>
      patched(zip, (copy, directory) => {
        const at = dataStartOf(entryMatching(directory, "/items/1/note-"));

        copy[at] = (copy[at] ?? 0) ^ 0xff;
      }),
  ],
  [
    "crc",
    "a record file whose stored checksum is wrong",
    (_, zip) =>
      patched(zip, (copy, directory) => {
        const record = entryMatching(directory, "/records/topics.1.jsonl");

        new DataView(copy.buffer).setUint32(
          centralRecordOf(copy, directory, record) + CENTRAL_CRC_AT,
          12_345,
          true,
        );
      }),
  ],
];
