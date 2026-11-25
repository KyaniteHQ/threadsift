import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ItemDetailResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { NoteConflictSchema, NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { Instance } from "./instance.ts";
import { paste } from "./library-fixtures.ts";
import { createAgentToken } from "./mcp-client.ts";

describe("a Note is saved against the revision the owner loaded, and a save of a stale revision is refused with the current Note", () => {
  let instance: Instance;
  let itemId: number;
  let pasted = 0;

  const freshItem = () => {
    pasted += 1;

    return paste(instance, `note-${String(pasted)}`, { title: "With a note", noDigest: true });
  };

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await freshItem();
  });

  after(() => instance.close());

  const put = (id: number, body: string, revision: number) =>
    instance.send("PUT", `/api/items/${String(id)}/note`, { body, revision });

  const noteOf = async (id = itemId) => (await instance.detail(id)).note;

  it("reads a Note that was never saved as revision 0 and no body", async () => {
    assert.deepEqual(await noteOf(await freshItem()), { body: null, revision: 0 });
  });

  it("saves a Note against revision 0 and answers it with the next revision", async () => {
    const id = await freshItem();
    const saved = await put(id, "first text", 0);

    assert.equal(saved.status, 200);
    assert.deepEqual(NoteResponseSchema.parse(JSON.parse(saved.body)), {
      note: { body: "first text", revision: 1 },
    });
    assert.deepEqual(await noteOf(id), { body: "first text", revision: 1 });
  });

  it("refuses a save of an old revision with 409, the current Note, and nothing written, then replaces the Note when the text is sent again with the revision the refusal named", async () => {
    const id = await freshItem();

    assert.equal((await put(id, "first text", 0)).status, 200);
    assert.equal((await put(id, "second text", 1)).status, 200);

    const stale = await put(id, "the owner's text", 1);

    assert.equal(stale.status, 409);

    const { note } = NoteConflictSchema.parse(JSON.parse(stale.body));

    assert.deepEqual(note, { body: "second text", revision: 2 });
    assert.deepEqual(await noteOf(id), { body: "second text", revision: 2 });

    const retried = await put(id, "the owner's text", note.revision);

    assert.equal(retried.status, 200);
    assert.deepEqual(await noteOf(id), { body: "the owner's text", revision: 3 });

    const older = await put(id, "text from a page two revisions behind", 1);

    assert.equal(older.status, 409);
    assert.deepEqual(NoteConflictSchema.parse(JSON.parse(older.body)).note, {
      body: "the owner's text",
      revision: 3,
    });
    assert.deepEqual(await noteOf(id), { body: "the owner's text", revision: 3 });
  });

  it("refuses the repeat of a save that landed, even when the texts match", async () => {
    const id = await freshItem();

    assert.equal((await put(id, "first text", 0)).status, 200);

    const landed = await put(id, "same text", 1);
    const repeated = await put(id, "same text", 1);

    assert.equal(landed.status, 200);
    assert.equal(repeated.status, 409);
    assert.deepEqual(await noteOf(id), { body: "same text", revision: 2 });
  });

  it("clears the Note with an empty or whitespace-only body, and advances the revision", async () => {
    const id = await freshItem();

    assert.equal((await put(id, "text to clear", 0)).status, 200);

    const cleared = await put(id, " \n\t ", 1);

    assert.equal(cleared.status, 200);
    assert.deepEqual(NoteResponseSchema.parse(JSON.parse(cleared.body)), {
      note: { body: null, revision: 2 },
    });
    assert.deepEqual(await noteOf(id), { body: null, revision: 2 });
  });

  it("accepts 10,000 code points, counted as code points and not as UTF-16 units, and refuses 10,001 with 400", async () => {
    const { revision } = await noteOf();

    const atLimit = await put(itemId, "\u{1D4D0}".repeat(10_000), revision);
    const over = await put(itemId, "\u{1D4D0}".repeat(10_001), revision + 1);

    assert.equal(atLimit.status, 200);
    assert.equal(over.status, 400);
    assert.equal((await noteOf()).revision, revision + 1);
  });

  it("answers 404 for an Item that does not exist", async () => {
    assert.equal((await put(itemId + 1000, "text", 0)).status, 404);
  });

  it("is closed to an agent token, which reads the Note with the Item", async () => {
    const token = await createAgentToken(instance, "all scopes", [
      "read",
      "add",
      "digest",
      "delete",
    ]);

    const { revision } = await noteOf();
    const owned = await put(itemId, "A Note the agent reads", revision);

    assert.equal(owned.status, 200);

    const write = await instance.sendWithToken(
      token.value,
      "PUT",
      `/api/items/${String(itemId)}/note`,
      { body: "from a token", revision: revision + 1 },
    );
    const read = await instance.sendWithToken(token.value, "GET", `/api/items/${String(itemId)}`);

    assert.equal(write.status, 403);
    assert.equal(read.status, 200);
    assert.deepEqual(ItemDetailResponseSchema.parse(JSON.parse(read.body)).item.note, {
      body: "A Note the agent reads",
      revision: revision + 1,
    });
  });
});
