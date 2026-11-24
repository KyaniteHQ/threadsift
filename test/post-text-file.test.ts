import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { placePostText } from "../src/features/thread/core/post-text-files.ts";
import { Instance } from "./instance.ts";
import { paste } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";

const LIMIT = 1_000_000;

describe("a post text over 1,000,000 UTF-8 bytes is stored as a file, and a shorter one stays in the Item row", () => {
  let instance: Instance;
  let itemId: number;

  const attemptKey = () => `items/${String(itemId)}/post-7-1.md`;

  const placed = (text?: string | null) =>
    placePostText(instance.core, { itemId, attemptKey: attemptKey() }, text);

  const stored = async (key: string) => {
    const body = await instance.core.files.get(key);

    return body === null ? null : new Response(body).text();
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "long-text", { title: "A long text", noDigest: true });
  });

  after(() => instance.close());

  it("keeps a text of exactly 1,000,000 bytes in the row and writes no file", async () => {
    const text = "a".repeat(LIMIT);
    const result = await placed(text);

    assert.deepEqual(result.columns, { postText: text, postTextKey: null });
    assert.deepEqual(result.files, { written: [], superseded: [] });
    assert.equal(await stored(attemptKey()), null);
  });

  it("writes a text of 1,000,001 bytes to the attempt's file and leaves the row's text empty", async () => {
    const text = "a".repeat(LIMIT + 1);
    const result = await placed(text);

    assert.deepEqual(result.columns, { postText: null, postTextKey: attemptKey() });
    assert.deepEqual(result.files, { written: [attemptKey()], superseded: [] });
    assert.equal(await stored(attemptKey()), text);
  });

  it("counts UTF-8 bytes and not characters, so 500,001 two-byte characters go to a file", async () => {
    const text = "é".repeat(LIMIT / 2 + 1);

    assert.ok(text.length < LIMIT);
    assert.equal((await placed(text)).columns?.postTextKey, attemptKey());
    assert.deepEqual((await placed("é".repeat(LIMIT / 2))).columns, {
      postText: "é".repeat(LIMIT / 2),
      postTextKey: null,
    });
  });

  it("names the file the Item holds now as superseded, for a text that replaces it and for one that clears it", async () => {
    const previous = `items/${String(itemId)}/post-3-1.md`;

    exec(
      instance,
      "update items set post_text = null, post_text_key = ? where id = ?",
      previous,
      itemId,
    );

    const replaced = await placed("a".repeat(LIMIT + 1));
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

    assert.ok(new TextEncoder().encode(text).length > LIMIT);

    const result = await placed(text);

    exec(
      instance,
      "update items set post_text = null, post_text_key = ? where id = ?",
      result.columns?.postTextKey ?? "",
      itemId,
    );

    assert.equal((await instance.detail(itemId)).postText, text);
  });
});
