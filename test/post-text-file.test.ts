import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { placePostText } from "../src/features/thread/core/post-text-files.ts";
import { itemTextAt, storedBytes } from "./file-store-fixtures.ts";
import { Instance } from "./instance.ts";
import { paste } from "./related-fixtures.ts";

describe("a post text over 1,000,000 UTF-8 bytes is stored as a file, and a shorter one stays in the Item row", () => {
  let instance: Instance;
  let itemId: number;

  const attemptKey = () => `items/${String(itemId)}/post-7-1.md`;

  const placed = (text?: string | null) =>
    placePostText(instance.core, { itemId, attemptKey: attemptKey() }, text);

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "long-text", { title: "A long text", noDigest: true });
  });

  after(() => instance.close());

  it("keeps a text of exactly 1,000,000 bytes in the row and writes no file", async () => {
    const text = "a".repeat(1_000_000);
    const result = await placed(text);

    assert.deepEqual(result.columns, { postText: text, postTextKey: null });
    assert.deepEqual(result.files, { written: [], superseded: [] });
    assert.equal(await storedBytes(instance, attemptKey()), null);
  });

  it("writes a text of 1,000,001 bytes to the attempt's file and leaves the row's text empty", async () => {
    const text = "a".repeat(1_000_001);
    const result = await placed(text);

    assert.deepEqual(result.columns, { postText: null, postTextKey: attemptKey() });
    assert.deepEqual(result.files, { written: [attemptKey()], superseded: [] });
    assert.deepEqual(await storedBytes(instance, attemptKey()), new TextEncoder().encode(text));
  });

  it("counts UTF-8 bytes and not characters, so 500,001 two-byte characters go to a file", async () => {
    const text = "é".repeat(500_001);

    assert.ok(text.length < 1_000_000);
    assert.equal((await placed(text)).columns?.postTextKey, attemptKey());
    assert.deepEqual((await placed("é".repeat(500_000))).columns, {
      postText: "é".repeat(500_000),
      postTextKey: null,
    });
  });

  it("names the file the Item holds now as superseded, for a text that replaces it and for one that clears it", async () => {
    const previous = `items/${String(itemId)}/post-3-1.md`;

    itemTextAt(instance, itemId, previous);

    const replaced = await placed("a".repeat(1_000_001));
    const shortened = await placed("a short text");
    const cleared = await placed(null);

    assert.deepEqual(replaced.files, { written: [attemptKey()], superseded: [previous] });
    assert.deepEqual(shortened.files, { written: [], superseded: [previous] });
    assert.deepEqual(cleared.columns, { postText: null, postTextKey: null });
    assert.deepEqual(cleared.files, { written: [], superseded: [previous] });
  });

  it("leaves the columns and the files alone when the fetch found no text", async () => {
    const result = await placed();

    assert.deepEqual(result, { columns: null, files: { written: [], superseded: [] } });
  });

  it("gives the Reader the whole text from the file the Item names", async () => {
    const text = `${"The long post text. ".repeat(60_000)}The end.`;

    assert.ok(new TextEncoder().encode(text).length > 1_000_000);

    const result = await placed(text);

    const key = result.columns?.postTextKey;

    assert.ok(key !== null && key !== undefined, "the text is placed in a file");
    itemTextAt(instance, itemId, key);

    assert.equal((await instance.detail(itemId)).postText, text);
  });
});
