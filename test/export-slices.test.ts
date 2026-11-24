import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { readStoredZip } from "../smoke/zip-read.ts";
import { ExportStatusSchema } from "../src/core/contract/export-contract.ts";
import { BACKUP_TABLES } from "../src/core/kernel/backup-tables.ts";
import {
  EXPORT_LIBRARY,
  type SavedLibrary,
  downloadedZip,
  firstLongText,
  readyExport,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import {
  bytesOfKey,
  postTextKey,
  type SliceEntry,
  numberedKeys,
  sliceEntries,
} from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { latestMigration } from "./related-fixtures.ts";
import { entriesOf, entryOf, linesOf, manifestOf, recordLines, rootOf } from "./zip-fixtures.ts";

const SLICE_BYTES = 8_388_608;

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
    assert.ok(parts >= 3, `${String(parts)} slices`);
    assert.equal((await numberedKeys(instance, exportId, "part")).length, parts);
    assert.equal((await numberedKeys(instance, exportId, "dir")).length, parts);
    assert.equal((await numberedKeys(instance, exportId, "tail")).length, 1);
  });

  it("holds 40 Items in its first slice, at most 40 in every slice and, after its first entry, at most 8 MiB of entries", async () => {
    const slices = await sliceEntries(instance, exportId, zip);

    assert.equal(slices.length, parts);

    for (const [at, slice] of slices.entries()) {
      const items = new Set(slice.flatMap(({ name }) => /\/items\/(\d+)\//u.exec(name)?.[1] ?? []));

      assert.ok(items.size <= 40, `slice ${String(at + 1)} holds ${String(items.size)} Items`);

      if (at === 0) assert.equal(items.size, 40);

      const [head, ...rest] = slice;

      assert.ok(head !== undefined, `slice ${String(at + 1)} holds an entry`);

      let total = head.size;

      for (const { name, size } of rest) {
        assert.ok(total + size <= SLICE_BYTES, `${name} passes the slice cap`);
        total += size;
      }
    }
  });

  it("streams every part, then every directory, then the tail, as one zip of the size the status reports", async () => {
    const keys = await Promise.all(
      ["part", "dir", "tail"].map((stem) => numberedKeys(instance, exportId, stem)),
    );

    const stored = await Promise.all(keys.flat().map((key) => bytesOfKey(instance, key)));

    const status = await instance.read("GET", "/api/export", ExportStatusSchema);

    assert.deepEqual(new Uint8Array(Buffer.concat(stored)), zip);
    assert.equal(status.state, "ready");
    assert.equal(status.zipBytes, zip.length);

    const answer = await instance.request(`/api/export/${String(exportId)}/download`);

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
    assert.deepEqual(entries, independent);
    assert.match(rootOf(entries), /^threadsift-\d{4}-\d{2}-\d{2}\/$/u);
    assert.ok([...entries.keys()].every((name) => name.startsWith(rootOf(entries))));
  });

  it("lists every backup table with the row count of its record files, and the library's own counts", async () => {
    const entries = await entriesOf(zip);
    const manifest = manifestOf(entries);
    assert.equal(manifest.format, 1);
    assert.equal(manifest.migration, latestMigration(instance));
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
      const isLong = library.longTexts.has(id);

      assert.equal(
        inFolder.filter((name) => /\/note-[^/]+\.md$/u.test(name)).length,
        1,
        `note of ${String(id)}`,
      );
      assert.equal(inFolder.length, isLong ? 2 : 1, `files of ${String(id)}`);
    }

    for (const [id, text] of library.longTexts) {
      assert.deepEqual(
        entryOf(entries, `${root}${postTextKey(id)}`),
        new TextEncoder().encode(text),
        `post text file of ${String(id)}`,
      );
    }

    const [first] = library.ids;
    const noteName = [...entries.keys()].find((name) =>
      name.startsWith(`${root}items/${String(first)}/note-`),
    );

    assert.ok(noteName !== undefined, "the Export holds the Markdown note of the first Item");

    const note = new TextDecoder().decode(entryOf(entries, noteName));

    assert.match(note, /Title of item-0/u);
    assert.match(note, /A short summary\./u);
    assert.match(note, /quartz seam/u);
    assert.equal(
      linesOf(entryOf(entries, `${root}records/items.1.jsonl`)).length,
      library.ids.length,
    );
  });
});

const sizeSum = (entries: readonly SliceEntry[]) =>
  entries.reduce((total, { size }) => total + size, 0);

const isEntry = (entry: SliceEntry | undefined, pattern: RegExp) =>
  entry !== undefined && pattern.test(entry.name);

function firstTwo(slices: readonly (readonly SliceEntry[])[]) {
  const [first, second] = slices;

  assert.ok(first !== undefined && second !== undefined, "the Export holds two slices");

  return { first, second };
}

describe("a slice ends where the next entry of an Item would pass 8 MiB", () => {
  let instance: Instance;
  let note: RegExp;
  let post: RegExp;
  let postKey: string;

  const BASE_TEXT_BYTES = 1_000_000;

  const exported = async (textBytes: number) => {
    await instance.core.files.put(postKey, new TextEncoder().encode("x".repeat(textBytes)));

    const ready = await readyExport(instance);
    const zip = await downloadedZip(instance, ready.id);

    return { zip, slices: await sliceEntries(instance, ready.id, zip) };
  };

  const exactFit = async () => {
    const {
      slices: [single],
    } = await exported(BASE_TEXT_BYTES);

    assert.ok(single !== undefined, "the Export holds a slice");

    return BASE_TEXT_BYTES + SLICE_BYTES - sizeSum(single.filter((entry) => !isEntry(entry, post)));
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();

    const { id: longId } = firstLongText(
      await savedLibrary(instance, { inlineText: 1, fileText: 1 }),
    );

    postKey = postTextKey(longId);
    note = new RegExp(`/items/${String(longId)}/note-[^/]+\\.md$`, "u");
    post = new RegExp(`/${postKey}$`, "u");
  });

  after(() => instance.close());

  it("takes an entry that fills the slice exactly, and starts the next entry in the next slice", async () => {
    const { first, second } = firstTwo((await exported(await exactFit())).slices);

    assert.equal(sizeSum(first), SLICE_BYTES);
    assert.ok(isEntry(first.at(-1), note));
    assert.ok(isEntry(second[0], post));
  });

  it("starts an entry that passes the cap by 1 byte in the next slice, with the post text file whole in the zip", async () => {
    const textBytes = (await exactFit()) + 1;
    const { zip, slices } = await exported(textBytes);
    const { first, second } = firstTwo(slices);
    const entries = await entriesOf(zip);

    assert.ok(sizeSum(first) < SLICE_BYTES);
    assert.ok(first.every((entry) => !isEntry(entry, note)));
    assert.ok(isEntry(second[0], note));
    assert.deepEqual(
      slices
        .flat()
        .filter((entry) => isEntry(entry, post))
        .map(({ size }) => size),
      [textBytes],
    );
    assert.deepEqual(
      entryOf(entries, `${rootOf(entries)}${postKey}`),
      new TextEncoder().encode("x".repeat(textBytes)),
    );
  });

  it("puts an entry above the cap first in a slice of its own, and still ends ready", async () => {
    const { slices } = await exported(SLICE_BYTES + 1);

    for (const pattern of [note, post]) {
      const slice = slices.find((entries) => entries.some((entry) => isEntry(entry, pattern)));

      assert.ok(slice !== undefined, `a slice holds ${String(pattern)}`);
      assert.ok(isEntry(slice[0], pattern));
      assert.equal(slice.length, 1);
    }
  });
});
