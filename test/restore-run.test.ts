import assert from "node:assert/strict";
import { type TestContext, after, afterEach, before, beforeEach, describe, it } from "node:test";

import { ItemListResponseSchema } from "../src/core/contract/item-route-wire.ts";
import {
  RESTORE_CHECK_BYTES,
  RESTORE_SETTLE_MS,
  restoreAnswerSchema,
} from "../src/core/contract/restore-contract.ts";
import {
  EXPORT_LIBRARY,
  NOTE_BODY,
  type SavedLibrary,
  exportedZip,
  firstLongText,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { Instance } from "./instance.ts";
import {
  CHANGED_TEXT,
  cancelledWhileHeld,
  doneAfterRetries,
  heldWrite,
  inFiles,
  itemKeys,
  keysAfterSweep,
  lateWriteZips,
  restoreAttemptFailures,
  settledOlderRestores,
  startedToFiles,
} from "./late-write-fixtures.ts";
import { paste, until } from "./library-fixtures.ts";
import { restoreStatus, restoredDone, settledRestore, startedRestore } from "./restore-fixtures.ts";
import {
  type Entries,
  dataStartOf,
  directoryOf,
  entriesOf,
  manifestOf,
  recordLines,
} from "./zip-fixtures.ts";

const AnswerSchema = restoreAnswerSchema("finished", "not-resumable");

const listed = (instance: Instance) => instance.send("GET", "/api/items");

const idsFound = async (instance: Instance, query: string) =>
  (await instance.read("GET", `/api/items${query}`, ItemListResponseSchema)).items
    .map(({ id }) => id)
    .toSorted((left, right) => left - right);

describe("a Restore of an Export that took several slices brings the library back under its own ids", () => {
  let source: Instance;
  let library: SavedLibrary;
  let zip: Uint8Array;
  let entries: Entries;
  let topId: number;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    library = await savedLibrary(source, EXPORT_LIBRARY);
    topId = Math.max(...library.ids);
    assert.equal((await source.send("DELETE", `/api/items/${String(topId)}`)).status, 204);
    zip = await exportedZip(source);
    entries = await entriesOf(zip);
  });

  after(() => source.close());

  describe("a damaged entry in the second check region", () => {
    let target: Instance;

    before(async () => {
      target = await Instance.start();
      await target.setUp();
    });

    after(() => target.close());

    it("is found, because the check walks the whole zip in regions of 8.25 MiB and not only its first", async () => {
      const directory = await directoryOf(zip);
      const last = directory.entries.findLast(({ name }) => name.includes("/post-"));

      assert.ok(last !== undefined);

      const at = dataStartOf(last) + last.size - 1;

      assert.ok(at > RESTORE_CHECK_BYTES, "the damaged byte lies past the first region");

      const damaged = zip.slice();

      damaged[at] = (damaged[at] ?? 0) ^ 0xff;
      await startedRestore(target, damaged);

      assert.equal((await settledRestore(target, ["failed"])).failure, "crc");
      assert.equal(target.database.rowCount("items"), 0);
    });
  });

  describe("a Restore of the whole zip", () => {
    let target: Instance;
    let started: number;
    let done: Awaited<ReturnType<typeof restoredDone>>;

    before(async () => {
      target = await Instance.start();
      await target.setUp();
      started = await startedRestore(target, zip);
      done = await restoredDone(target);
    });

    after(() => target.close());

    it("ends done with each table's rows restored, no row dropped and each stored file put back", () => {
      const manifest = manifestOf(entries);

      assert.equal(done.id, started);

      const expected = Object.fromEntries(
        Object.entries(manifest.tables)
          .filter(([, { rows: counted }]) => counted > 0)
          .map(([table, { rows: counted }]) => [table, counted]),
      );

      assert.deepEqual(done.restored, expected);
      assert.ok(Object.values(done.dropped).every((dropped) => dropped === 0));
      assert.equal(done.files, library.longTexts.size - 1);
      assert.equal(done.missingFiles, 0);
      assert.equal(done.keptHighlights, 0);
      assert.equal(recordLines(entries, "items").length, library.ids.length - 1);
    });

    it("gives every Item its id, text, Digest, Highlight and Note back, so the Reader shows what the source showed", async () => {
      const ids = library.ids.filter((id) => id !== topId);
      const [sourceItems, restoredItems] = await Promise.all([
        Promise.all(ids.map((id) => source.detail(id))),
        Promise.all(ids.map((id) => target.detail(id))),
      ]);

      assert.deepEqual(restoredItems, sourceItems);

      const marked = restoredItems.find(({ id }) => id === library.highlightedId);

      assert.equal(marked?.highlights.items.length, 1);
      assert.equal(marked?.note.body, NOTE_BODY);
    });

    it("puts the text stored beside an Item back, and lists the Items as the source does", async () => {
      const long = firstLongText(library);

      assert.equal((await target.detail(long.id)).postText, long.text);
      assert.equal((await listed(target)).body, (await listed(source)).body);
    });

    it("rebuilds the search index from the restored text, file-backed text included", async () => {
      const restored = library.textedIds.filter((id) => id !== topId);

      assert.deepEqual(await idsFound(target, "?q=quartz"), restored);
      assert.deepEqual(
        await idsFound(target, "?q=beside"),
        [...library.longTexts.keys()].filter((id) => id !== topId),
      );
      assert.deepEqual(await idsFound(source, "?q=quartz"), restored);
    });

    it("starts with no work in flight and continues ids after the highest the source ever used", async () => {
      assert.equal(target.database.rowCount("jobs", "kind <> 'restore'"), 0);

      const [fromSource, fromTarget] = await Promise.all([
        paste(source, "after-restore", { title: "After the Restore" }),
        paste(target, "after-restore", { title: "After the Restore" }),
      ]);

      assert.equal(fromSource, topId + 1);
      assert.equal(fromTarget, fromSource);
    });

    it("refuses a Cancel once the library holds the restored Items, and a Resume of a Restore that did not give up", async () => {
      const cancel = await target.send("DELETE", `/api/restore/${String(started)}`);
      const resume = await target.send("POST", `/api/restore/${String(started)}/resume`);

      assert.deepEqual([cancel.status, resume.status], [409, 409]);
      assert.deepEqual(
        [cancel.body, resume.body].map((body) => AnswerSchema.parse(JSON.parse(body)).code),
        ["finished", "not-resumable"],
      );
      assert.equal((await restoreStatus(target)).state, "done");
    });
  });
});

describe("a cancelled Restore's files unit that writes late", () => {
  let zips: Awaited<ReturnType<typeof lateWriteZips>>;
  let target: Instance;

  before(async () => {
    zips = await lateWriteZips();
  });

  beforeEach(async () => {
    target = await Instance.start();
    await target.setUp();
  });

  afterEach(() => target.close());

  const holdingKey = (t: TestContext) =>
    heldWrite(t, target, (name) => name === zips.key && inFiles(target, 1));

  it("keeps a write that was in flight at the Cancel off the next Restore's post text file", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    await startedToFiles(target, zips.second);
    held.release();
    await held.landed;
    settledOlderRestores(target);
    await doneAfterRetries(target);

    assert.equal((await target.detail(zips.itemId)).postText, CHANGED_TEXT);
  });

  it("starts no write after its unit's deadline, even once the next Restore is done", async (t) => {
    const failed = restoreAttemptFailures(t);
    const held = heldWrite(t, target, (name) => name.startsWith("items/") && inFiles(target, 1));

    await cancelledWhileHeld(target, zips.first, held.reached);
    await startedToFiles(target, zips.second);

    const now = Date.now.bind(Date);

    t.mock.method(Date, "now", () => now() + RESTORE_SETTLE_MS);
    await doneAfterRetries(target);

    const startedBefore = held.started.length;

    held.release();
    await held.landed;
    await until(
      "the late unit fails or starts another write",
      () => Promise.resolve(failed().length + held.started.length - startedBefore),
      (count) => count > 0,
    );

    assert.deepEqual(held.started.slice(startedBefore), []);
  });

  it("removes a late write that the next zip has no entry for, also when the next Restore's first files unit runs twice", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    held.release();
    await held.landed;
    assert.ok((await itemKeys(target, zips.itemId)).includes(zips.key));

    const write = target.core.files.put.bind(target.core.files);
    let crashed = false;

    t.mock.method(target.core.files, "put", async (name: string, bytes: Uint8Array) => {
      if (!crashed && inFiles(target, 2)) {
        crashed = true;
        throw new Error("the first files unit stops after the clear");
      }

      await write(name, bytes);
    });
    await startedToFiles(target, zips.withoutKey);
    settledOlderRestores(target);
    await doneAfterRetries(target);

    assert.equal(crashed, true);
    assert.deepEqual(await itemKeys(target, zips.itemId), []);
    assert.ok((await itemKeys(target, zips.otherItemId)).includes(zips.otherKey));
  });

  it("leaves a late write after a Cancel with no next Restore to the file sweep, which removes it", async (t) => {
    const held = holdingKey(t);

    await cancelledWhileHeld(target, zips.first, held.reached);
    held.release();
    await held.landed;
    assert.ok((await itemKeys(target, zips.itemId)).includes(zips.key));

    assert.deepEqual(await keysAfterSweep(target, zips.itemId), []);
  });
});
