import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { readStoredZip } from "../smoke/zip-read.ts";
import {
  EXPORT_SLICE_BYTES,
  EXPORT_SLICE_ITEMS,
  ExportStatusSchema,
} from "../src/core/contract/export-contract.ts";
import { BACKUP_TABLES } from "../src/core/kernel/backup-tables.ts";
import {
  EXPORT_LIBRARY,
  type SavedLibrary,
  type SliceEntry,
  bytesOfKey,
  downloadedZip,
  longPostText,
  postTextKey,
  readyExport,
  savedLibrary,
  sliceEntries,
  storedKeys,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import { rows } from "./related-fixtures.ts";
import { entriesOf, entryOf, linesOf, manifestOf, recordLines, rootOf } from "./zip-fixtures.ts";

const MigrationSchema = z.object({ name: z.string() });

const bytesEqual = (left: Uint8Array | undefined, right: Uint8Array | undefined): boolean =>
  left !== undefined &&
  right !== undefined &&
  left.length === right.length &&
  left.every((byte, at) => byte === right[at]);

describe("an Export of a library too big for one slice is one complete zip", () => {
  let instance: Instance;
  let library: SavedLibrary;
  let exportId: number;
  let zip: Uint8Array;
  let parts: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    library = await savedLibrary(instance, EXPORT_LIBRARY);

    const ready = await readyExport(instance);

    exportId = ready.id;
    zip = await downloadedZip(instance, ready.id);
    assert.equal(ready.status.state, "ready");
    parts = ready.status.parts;
  });

  after(() => instance.close());

  it("closes a slice at 40 Items or 8 MiB, so 50 Items with 5 post text files of 1.1 MB take at least 3 slices", async () => {
    const keys = await storedKeys(instance, `exports/${String(exportId)}/`);
    const named = (stem: string) => keys.filter((key) => key.includes(`/${stem}-`));

    assert.ok(parts >= 3, `${String(parts)} slices`);
    assert.equal(named("part").length, parts);
    assert.equal(named("dir").length, parts);
    assert.equal(named("tail").length, 1);
  });

  it("holds at most 40 Items and, after its first entry, at most 8 MiB of entries in every slice", async () => {
    const slices = await sliceEntries(instance, exportId, zip);

    assert.equal(slices.length, parts);

    for (const [at, slice] of slices.entries()) {
      const items = new Set(slice.flatMap(({ name }) => /\/items\/(\d+)\//u.exec(name)?.[1] ?? []));

      assert.ok(
        items.size <= EXPORT_SLICE_ITEMS,
        `slice ${String(at + 1)} holds ${String(items.size)} Items`,
      );

      slice.slice(1).reduce((total, { name, size }) => {
        assert.ok(total + size <= EXPORT_SLICE_BYTES, `${name} passes the slice cap`);

        return total + size;
      }, slice[0]?.size ?? 0);
    }
  });

  it("streams every part, then every directory, then the tail, as one zip of the size the status reports", async () => {
    const keys = await storedKeys(instance, `exports/${String(exportId)}/`);
    const numbered = (stem: string) =>
      keys
        .filter((key) => key.includes(`/${stem}-`))
        .toSorted((left, right) => Number(left.split("-")[1]) - Number(right.split("-")[1]));

    const stored = await Promise.all(
      [...numbered("part"), ...numbered("dir"), ...numbered("tail")].map((key) =>
        bytesOfKey(instance, key),
      ),
    );

    const joined = Buffer.concat(stored);

    const status = await instance.read("GET", "/api/export", ExportStatusSchema);

    assert.ok(bytesEqual(joined, zip));
    assert.equal(status.state === "ready" ? status.zipBytes : -1, zip.length);

    const answer = await instance.fetch(`/api/export/${String(exportId)}/download`, {
      headers: { cookie: instance.sessionCookie ?? "" },
    });

    await answer.arrayBuffer();
    assert.equal(answer.headers.get("content-length"), String(zip.length));
    assert.match(
      answer.headers.get("content-disposition") ?? "",
      /^attachment; filename="threadsift-\d{4}-\d{2}-\d{2}\.zip"$/u,
    );
  });

  it("reads back the same under an independent zip reader and the Restore reader, with one root folder", async () => {
    const independent = readStoredZip(zip);
    const entries = await entriesOf(zip);

    assert.deepEqual([...entries.keys()].toSorted(), [...independent.keys()].toSorted());
    assert.ok([...entries].every(([name, bytes]) => bytesEqual(bytes, independent.get(name))));
    assert.match(rootOf(entries), /^threadsift-\d{4}-\d{2}-\d{2}\/$/u);
    assert.ok([...entries.keys()].every((name) => name.startsWith(rootOf(entries))));
  });

  it("lists every backup table with the row count of its record files, and the library's own counts", async () => {
    const entries = await entriesOf(zip);
    const manifest = manifestOf(entries);
    const [applied] = rows(
      instance,
      MigrationSchema,
      "select max(name) as name from d1_migrations",
    );

    assert.equal(manifest.format, 1);
    assert.equal(manifest.migration, applied?.name);
    assert.equal(manifest.openItems, 0);
    assert.deepEqual(
      Object.keys(manifest.tables).toSorted(),
      Object.keys(BACKUP_TABLES).toSorted(),
    );

    for (const [table, { files, rows: counted }] of Object.entries(manifest.tables)) {
      assert.ok(files.length > 0, `${table} has a record file, empty or not`);
      assert.equal(recordLines(entries, table).length, counted, `${table} rows`);
      assert.deepEqual(
        files,
        files.map((_, at) => `records/${table}.${String(at + 1)}.jsonl`),
      );
    }

    const counts = (table: string) => manifest.tables[table]?.rows;

    assert.equal(counts("items"), library.ids.length);
    assert.equal(counts("digests"), library.textedIds.length);
    assert.equal(counts("notes"), 1);
    assert.equal(counts("topics"), 2);
    assert.equal(counts("tags"), 2);
    assert.equal(counts("highlights"), 1);
    assert.ok((manifest.sequences["items"] ?? 0) >= Math.max(...library.ids));
  });

  it("holds one Markdown note for every Item and the post text file of each Item that stores one, whole, in the zip", async () => {
    const entries = await entriesOf(zip);
    const root = rootOf(entries);

    for (const id of library.ids) {
      const inFolder = [...entries.keys()].filter((name) =>
        name.startsWith(`${root}items/${String(id)}/`),
      );
      const isLong = library.longTextIds.includes(id);

      assert.equal(
        inFolder.filter((name) => /\/note-[^/]+\.md$/u.test(name)).length,
        1,
        `note of ${String(id)}`,
      );
      assert.equal(inFolder.length, isLong ? 2 : 1, `files of ${String(id)}`);
    }

    for (const id of library.longTextIds) {
      const stored = entries.get(`${root}${postTextKey(id)}`);
      const expected = new TextEncoder().encode(longPostText(`item-${String(id)}`));

      assert.ok(bytesEqual(stored, expected), `post text file of ${String(id)}`);
    }

    const [first] = library.ids;
    const note = new TextDecoder().decode(
      entries.get(
        [...entries.keys()].find((name) =>
          name.startsWith(`${root}items/${String(first)}/note-`),
        ) ?? "",
      ),
    );

    assert.match(note, /Title of item-0/u);
    assert.match(note, /A short summary\./u);
    assert.match(note, /quartz seam/u);
    assert.equal(
      linesOf(entryOf(entries, `${root}records/items.1.jsonl`)).length,
      library.ids.length,
    );
  });
});

const sizeSum = (entries: readonly SliceEntry[] | undefined) =>
  (entries ?? []).reduce((total, { size }) => total + size, 0);

const named = (entry: SliceEntry | undefined, pattern: RegExp) =>
  entry !== undefined && pattern.test(entry.name);

describe("a slice ends where the next entry of an Item would pass 8 MiB", () => {
  let instance: Instance;
  let note: RegExp;
  let post: RegExp;
  let postKey: string;

  const BASE_TEXT_BYTES = 1_000_000;

  const exported = async (textBytes: number) => {
    await instance.core.files.put(postKey, new TextEncoder().encode("x".repeat(textBytes)));

    const ready = await readyExport(instance);

    return sliceEntries(instance, ready.id, await downloadedZip(instance, ready.id));
  };

  const exactFit = async () => {
    const [single] = await exported(BASE_TEXT_BYTES);

    return (
      BASE_TEXT_BYTES + EXPORT_SLICE_BYTES - sizeSum(single?.filter((entry) => !named(entry, post)))
    );
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    const library = await savedLibrary(instance, { small: 1, long: 1 });
    const longId = library.longTextIds[0] ?? 0;

    postKey = postTextKey(longId);
    note = new RegExp(`/items/${String(longId)}/note-[^/]+\\.md$`, "u");
    post = new RegExp(`/${postKey}$`, "u");
  });

  after(() => instance.close());

  it("takes an entry that fills the slice exactly, and starts the next entry in the next slice", async () => {
    const [first, second] = await exported(await exactFit());

    assert.equal(sizeSum(first), EXPORT_SLICE_BYTES);
    assert.ok(named(first?.at(-1), note));
    assert.ok(named(second?.[0], post));
  });

  it("starts an entry that passes the cap by 1 byte in the next slice", async () => {
    const [first, second] = await exported((await exactFit()) + 1);

    assert.ok(sizeSum(first) < EXPORT_SLICE_BYTES);
    assert.ok((first ?? []).every((entry) => !named(entry, note)));
    assert.ok(named(second?.[0], note));
  });

  it("puts an entry above the cap first in a slice of its own, and still ends ready", async () => {
    const slices = await exported(EXPORT_SLICE_BYTES + 1);

    for (const pattern of [note, post]) {
      const slice = slices.find((entries) => entries.some((entry) => named(entry, pattern)));

      assert.ok(named(slice?.[0], pattern));
      assert.equal(slice?.length, 1);
    }
  });
});
