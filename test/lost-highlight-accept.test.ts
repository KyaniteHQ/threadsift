import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { HighlightsPageResponseSchema } from "../src/http/highlights-page-schemas.ts";
import { Instance } from "./instance.ts";
import {
  highlightStatus,
  keepLostHighlight,
  keepPassage,
  proposalRows,
  proposeLost,
  readPage,
  repaste,
  textHolding,
  withoutForeignKeys,
} from "./lost-highlight-fixtures.ts";
import { SECRET_KEY, exec, rows } from "./related-fixtures.ts";

const IdSchema = z.object({ id: z.number() });

const ColumnsSchema = z.object({
  id: z.number(),
  item_id: z.number(),
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  hint: z.number(),
  projection: z.number(),
  status: z.string(),
  start: z.number().nullable(),
});

const partsOf = (instance: Instance, highlightId: number) =>
  rows(
    instance,
    IdSchema,
    "select id from search_parts where kind = 'highlight' and highlight_id = ?",
    highlightId,
  );

const listedIds = async (instance: Instance) =>
  (await readPage(instance)).proposals.map(({ id }) => id);

describe("Accept of a lost-Highlight row", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("removes the Highlight, its search part and the row, and leaves the Item, its Note and its other Highlights", async () => {
    const lost = await keepLostHighlight(instance, "removal", "gone", "the first passage");
    const reader = await instance.detail(lost.itemId);
    const other = await keepPassage(instance, lost.itemId, "A long sentence that comes after");

    await instance.read("PUT", `/api/items/${String(lost.itemId)}/note`, z.unknown(), {
      body: "Keep this note",
      revision: reader.note.revision,
    });

    const id = await proposeLost(instance, lost.highlightId);

    assert.equal(partsOf(instance, lost.highlightId).length, 1);

    const answer = await instance.send("POST", `/api/proposals/${String(id)}/accept`);

    assert.deepEqual([answer.status, answer.body], [200, JSON.stringify({ state: "done" })]);
    assert.equal(highlightStatus(instance, lost.highlightId), undefined);
    assert.deepEqual(partsOf(instance, lost.highlightId), []);
    assert.deepEqual(proposalRows(instance), []);

    const remaining = await instance.detail(lost.itemId);

    assert.deepEqual(
      remaining.highlights.items.map(({ id: each }) => each),
      [other],
    );
    assert.equal(remaining.note.body, "Keep this note");

    const page = await instance.read("GET", "/api/highlights", HighlightsPageResponseSchema);

    assert.equal(
      page.entries.some((entry) => entry.kind === "highlight" && entry.id === lost.highlightId),
      false,
    );

    const again = await instance.send("POST", `/api/proposals/${String(id)}/accept`);

    assert.equal(again.status, 404);
  });

  it("answers 409 not-current for a Highlight that is found again, and keeps it and the row", async () => {
    const lost = await keepLostHighlight(
      instance,
      "found-again",
      "ambiguous",
      "the second passage",
    );

    const id = await proposeLost(instance, lost.highlightId);

    await repaste(instance, "found-again", textHolding("the second passage"));
    assert.equal(highlightStatus(instance, lost.highlightId), "attached");

    const kept = JSON.stringify(
      rows(instance, ColumnsSchema, "select * from highlights where id = ?", lost.highlightId),
    );

    const answer = await instance.send("POST", `/api/proposals/${String(id)}/accept`);

    assert.deepEqual([answer.status, answer.body], [409, JSON.stringify({ error: "not-current" })]);
    assert.equal(
      JSON.stringify(
        rows(instance, ColumnsSchema, "select * from highlights where id = ?", lost.highlightId),
      ),
      kept,
    );
    assert.deepEqual(
      proposalRows(instance).map((row) => [row.id, row.state]),
      [[id, "open"]],
    );
    assert.deepEqual(await listedIds(instance), []);
    exec(instance, "delete from proposals");
  });
});

describe("deleting an Item that holds lost-Highlight rows", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("removes its open and rejected rows with foreign keys off, leaves the rows of other Items, and cascades with them on", async () => {
    const first = await keepLostHighlight(instance, "first", "gone", "the first passage");
    const second = await keepPassage(instance, first.itemId, "A long sentence that comes after");
    const other = await keepLostHighlight(instance, "other", "gone", "the other passage");

    exec(instance, "update highlights set status = 'gone', start = null where id = ?", second);

    const open = await proposeLost(instance, first.highlightId);
    const rejected = await proposeLost(instance, second, "rejected");
    const kept = await proposeLost(instance, other.highlightId);

    assert.equal(
      await instance.statusThrough(
        withoutForeignKeys(instance.databaseFile),
        "DELETE",
        `/api/items/${String(first.itemId)}`,
      ),
      204,
    );
    assert.deepEqual(
      proposalRows(instance).map(({ id }) => id),
      [kept],
    );
    assert.equal([open, rejected].includes(kept), false);

    assert.equal((await instance.send("DELETE", `/api/items/${String(other.itemId)}`)).status, 204);
    assert.deepEqual(proposalRows(instance), []);
  });
});
