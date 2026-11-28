import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { readStoredZip } from "../smoke/zip-read.ts";
import { ExportStatusSchema } from "../src/core/contract/export-contract.ts";
import { BACKUP_TABLES } from "../src/core/kernel/backup-tables.ts";
import {
  MIB,
  exportChangedOnRead,
  imagesOf,
  instanceWithLongText,
  notesOf,
  storeImages,
} from "./export-refresh-fixtures.ts";
import {
  EXPORT_LIBRARY,
  type SavedLibrary,
  downloadedZip,
  exportPieces,
  exportWithPostText,
  assertWithinCap,
  exactFitBytes,
  firstTwo,
  isEntry,
  readyExport,
  savedLibrary,
  sizeSum,
  sliceEntries,
} from "./export-restore-fixtures.ts";
import { bytesOfKey, postTextKey } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  assertSameBytes,
  entriesOf,
  entryOf,
  linesOf,
  manifestOf,
  recordLines,
  rootOf,
} from "./zip-fixtures.ts";

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
    const pieces = await exportPieces(instance, exportId);

    assert.equal(pieces.parts.length, parts);
    assert.equal(pieces.directories.length, parts);
    assert.equal(pieces.tails.length, 1);
  });

  it("holds 40 Items in its first slice, at most 40 in every slice and, after its first entry, at most 8 MiB of entries", async () => {
    const slices = await sliceEntries(instance, exportId, zip);

    assert.equal(slices.length, parts);

    for (const [at, slice] of slices.entries()) {
      const items = new Set(slice.flatMap(({ name }) => /\/items\/(\d+)\//u.exec(name)?.[1] ?? []));

      assert.ok(items.size <= 40, `slice ${String(at + 1)} holds ${String(items.size)} Items`);

      if (at === 0) assert.equal(items.size, 40);

      assertWithinCap(slice, SLICE_BYTES, `slice ${String(at + 1)}`);
    }
  });

  it("streams every part, then every directory, then the tail, as one zip of the size the status reports", async () => {
    const { parts: partKeys, directories, tails } = await exportPieces(instance, exportId);

    const stored = await Promise.all(
      [...partKeys, ...directories, ...tails].map((key) => bytesOfKey(instance, key)),
    );

    const status = await instance.read("GET", "/api/export", ExportStatusSchema);

    assertSameBytes(Buffer.concat(stored), zip, "the stored pieces in download order");
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
    for (const [name, bytes] of entries) {
      assertSameBytes(bytes, entryOf(independent, name), name);
    }
    assert.match(rootOf(entries), /^threadsift-\d{4}-\d{2}-\d{2}\/$/u);
    assert.ok([...entries.keys()].every((name) => name.startsWith(rootOf(entries))));
  });

  it("lists every backup table with the row count of its record files, and the library's own counts", async () => {
    const entries = await entriesOf(zip);
    const manifest = manifestOf(entries);
    assert.equal(manifest.format, 1);
    assert.equal(manifest.migration, instance.database.latestMigration());
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

      assert.equal(notesOf(entries, id).length, 1, `note of ${String(id)}`);
      assert.equal(inFolder.length, isLong ? 2 : 1, `files of ${String(id)}`);
    }

    for (const [id, text] of library.longTexts) {
      assertSameBytes(
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

describe("a slice ends where the next entry of an Item would pass 8 MiB", () => {
  let instance: Instance;
  let note: RegExp;
  let post: RegExp;
  let postKey: string;
  let fit: number;

  const exported = (textBytes: number) => exportWithPostText(instance, postKey, textBytes);

  before(async () => {
    let longId: number;

    ({ instance, itemId: longId } = await instanceWithLongText());
    postKey = postTextKey(longId);
    note = new RegExp(`/items/${String(longId)}/note-[^/]+\\.md$`, "u");
    post = new RegExp(`/${postKey}$`, "u");
    fit = await exactFitBytes(instance, postKey, SLICE_BYTES);
  });

  after(() => instance.close());

  it("takes an entry that fills the slice exactly, and starts the next entry in the next slice", async () => {
    const { first, second } = firstTwo((await exported(fit)).slices);

    assert.equal(sizeSum(first), SLICE_BYTES);
    assert.ok(isEntry(first.at(-1), note));
    assert.ok(isEntry(second[0], post));
  });

  it("starts an entry that passes the cap by 1 byte in the next slice, with the post text file whole in the zip", async () => {
    const textBytes = fit + 1;
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
    assertSameBytes(
      entryOf(entries, `${rootOf(entries)}${postKey}`),
      new TextEncoder().encode("x".repeat(textBytes)),
      "post text file",
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

describe("an Item changed between two slices of its own entries", () => {
  let instance: Instance;
  let itemId: number;

  before(async () => {
    ({ instance, itemId } = await instanceWithLongText());
  });

  after(() => instance.close());

  it("holds every image of the refreshed version when a slice wrote the note, the post text and the first old image", async (t) => {
    const fresh = imagesOf(itemId, 901, 5, MIB);
    const entries = await exportChangedOnRead(t, instance, imagesOf(itemId, 900, 3, 5 * MIB), () =>
      storeImages(instance, fresh),
    );

    for (const { key, bytes } of fresh.images)
      assertSameBytes(entryOf(entries, `${rootOf(entries)}${key}`), bytes, key);
  });

  it("holds one note of the Item when its title changes after a slice wrote the note", async (t) => {
    const retitle = () => {
      instance.database.exec("update digests set title = 'A new title' where item_id = ?", itemId);
    };
    const entries = await exportChangedOnRead(
      t,
      instance,
      imagesOf(itemId, 902, 3, 5 * MIB),
      retitle,
    );

    assert.equal(notesOf(entries, itemId).length, 1);
  });
});
