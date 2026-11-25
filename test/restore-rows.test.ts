import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";

import {
  MARKED_PASSAGE,
  type SavedLibrary,
  exportedZip,
  firstLongText,
  savedLibrary,
} from "./export-restore-fixtures.ts";
import { postTextKey } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { restoredDone, startedRestore } from "./restore-fixtures.ts";
import {
  type Entries,
  entriesOf,
  manifestOf,
  nameEndingWith,
  rootOf,
  withRecordLines,
  withoutEntry,
  zipOf,
} from "./zip-fixtures.ts";

describe("a Restore counts the rows and the files it leaves out, and anchors Highlights again in the restored text", () => {
  let source: Instance;
  let library: SavedLibrary;
  let entries: Entries;
  let target: Instance;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    library = await savedLibrary(source, { inlineText: 3, fileText: 1 });
    entries = await entriesOf(await exportedZip(source));
  });

  after(() => source.close());

  afterEach(() => target.close());

  const restored = async (changed: Entries) => {
    target = await Instance.start();
    await target.setUp();
    await startedRestore(target, zipOf(changed));

    return restoredDone(target);
  };

  const withLines = (table: string, change: (lines: readonly string[]) => readonly string[]) =>
    withRecordLines(entries, table, change);

  it("leaves out a row that repeats the key of an earlier row and counts it in dropped", async () => {
    const done = await restored(withLines("topics", (lines) => [...lines, ...lines.slice(0, 1)]));

    assert.equal(done.dropped["topics"], 1);
    assert.equal(done.restored["topics"], manifestOf(entries).tables["topics"]?.rows);
  });

  it("leaves out a row whose parent is not in the zip, and the Item shows no Note", async () => {
    const orphan = withLines("notes", (lines) =>
      lines.map((line) =>
        line.replace(`"item_id":${String(library.highlightedId)}`, '"item_id":9999'),
      ),
    );

    const done = await restored(orphan);

    assert.equal(done.dropped["notes"], 1);
    assert.equal(done.restored["notes"], 0);
    assert.equal((await target.detail(library.highlightedId)).note.body, null);
  });

  it("counts a stored file the zip lacks as missing, keeps the Item and shows it with no text", async () => {
    const { id: longId } = firstLongText(library);
    const lacking = withoutEntry(entries, `${rootOf(entries)}${postTextKey(longId)}`);
    const done = await restored(lacking);

    assert.equal(done.missingFiles, 1);
    assert.equal(done.files, 0);

    const item = await target.detail(longId);

    assert.equal(item.id, longId);
    assert.equal(item.postText, null);
  });

  it("takes the status of a Highlight from the restored text and not from the exported columns", async () => {
    const lost = withLines("highlights", (lines) =>
      lines.map((line) =>
        line
          .replace('"status":"attached"', '"status":"gone"')
          .replace(/"start":\d+/u, '"start":null'),
      ),
    );

    assert.notEqual(
      new TextDecoder().decode(lost.get(nameEndingWith(lost, "/records/highlights.1.jsonl"))),
      new TextDecoder().decode(entries.get(nameEndingWith(entries, "/records/highlights.1.jsonl"))),
    );

    await restored(lost);

    const { highlights, postText } = await target.detail(library.highlightedId);

    assert.deepEqual(
      highlights.items.map(({ status }) => status),
      ["attached"],
    );
    assert.deepEqual(
      highlights.items.map((highlight) => ("start" in highlight ? highlight.start : null)),
      [postText?.indexOf(MARKED_PASSAGE)],
    );
  });
});
