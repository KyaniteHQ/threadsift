import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ItemDetailResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { NoteConflictSchema, NoteResponseSchema } from "../src/core/contract/note-contract.ts";
import { Instance } from "./instance.ts";
import { createAgentToken } from "./mcp-client.ts";
import { paste } from "./related-fixtures.ts";

const NOTE_MAX_CODE_POINTS = 10_000;

describe("a Note is saved against the revision the owner loaded, and a save of a stale revision is refused with the current Note", () => {
  let instance: Instance;
  let itemId: number;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    itemId = await paste(instance, "note", { title: "With a note", noDigest: true });
  });

  after(() => instance.close());

  const put = (id: number, body: string, revision: number) =>
    instance.send("PUT", `/api/items/${String(id)}/note`, { body, revision });

  const noteOf = async () => (await instance.detail(itemId)).note;

  it("reads a Note that was never saved as revision 0 and no body", async () => {
    assert.deepEqual(await noteOf(), { body: null, revision: 0 });
  });

  it("saves a Note against revision 0 and answers it with the next revision", async () => {
    const saved = await put(itemId, "first text", 0);

    assert.equal(saved.status, 200);
    assert.deepEqual(NoteResponseSchema.parse(JSON.parse(saved.body)), {
      note: { body: "first text", revision: 1 },
    });
    assert.deepEqual(await noteOf(), { body: "first text", revision: 1 });
  });

  it("refuses a save of an old revision with 409, the current Note, and nothing written", async () => {
    await put(itemId, "second text", 1);

    const stale = await put(itemId, "text from a stale page", 1);

    assert.equal(stale.status, 409);
    assert.deepEqual(NoteConflictSchema.parse(JSON.parse(stale.body)).note, {
      body: "second text",
      revision: 2,
    });
    assert.deepEqual(await noteOf(), { body: "second text", revision: 2 });
  });

  it("refuses the repeat of a save that landed, even when the texts match", async () => {
    const landed = await put(itemId, "same text", 2);
    const repeated = await put(itemId, "same text", 2);

    assert.equal(landed.status, 200);
    assert.equal(repeated.status, 409);
    assert.deepEqual(await noteOf(), { body: "same text", revision: 3 });
  });

  it("replaces the Note when the text is sent again with the revision the refusal named", async () => {
    const stale = await put(itemId, "the owner's text", 1);
    const { note } = NoteConflictSchema.parse(JSON.parse(stale.body));
    const retried = await put(itemId, "the owner's text", note.revision);

    assert.equal(retried.status, 200);
    assert.deepEqual(await noteOf(), { body: "the owner's text", revision: note.revision + 1 });
  });

  it("clears the Note with an empty or whitespace-only body, and advances the revision", async () => {
    const { revision } = await noteOf();

    const cleared = await put(itemId, " \n\t ", revision);

    assert.equal(cleared.status, 200);
    assert.deepEqual(NoteResponseSchema.parse(JSON.parse(cleared.body)), {
      note: { body: null, revision: revision + 1 },
    });
    assert.deepEqual(await noteOf(), { body: null, revision: revision + 1 });
  });

  it("accepts 10,000 code points, counted as code points and not as UTF-16 units, and refuses 10,001 with 400", async () => {
    const { revision } = await noteOf();

    const atLimit = await put(itemId, "\u{1D4D0}".repeat(NOTE_MAX_CODE_POINTS), revision);
    const over = await put(itemId, "\u{1D4D0}".repeat(NOTE_MAX_CODE_POINTS + 1), revision + 1);

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
