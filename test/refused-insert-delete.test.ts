import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { BatchResponseSchema } from "../src/core/contract/batch-wire.ts";
import { Instance } from "./instance.ts";
import { afterRefusedBatch } from "./refused-batch.ts";
import {
  FAILED,
  firstResolved,
  itemsAt,
  pasteVia,
  redditPost,
  repasted,
} from "./short-link-fixtures.ts";

describe("a Paste whose insert a guard refused starts again when the owner deleted the Item before the guard was read again", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const deleteItem = async (id: number) => {
    const deleted = await instance.send("DELETE", `/api/items/${String(id)}`);

    assert.equal(deleted.status, 204);
  };

  it("saves a new failed Item in the same Paste when the owner deletes the failed Item right after the insert of a refreshing Paste was refused", async () => {
    const short = "https://t.co/refuseddeletedrefresh";
    const first = await pasteVia(instance, short);

    assert.equal(first.status, 201);

    const again = await afterRefusedBatch(
      instance,
      () => deleteItem(first.saved.item.id),
      () => pasteVia(instance, short),
    );

    assert.equal(again.status, 201);
    assert.notEqual(again.saved.item.id, first.saved.item.id);
    assert.equal(itemsAt(instance, short), 1);
  });

  it("answers a lost race when the owner deletes the failed Item right after the insert of a keeping Paste was refused, and the next Paste saves a new Item", async () => {
    const short = "https://t.co/refuseddeletedkeep";
    const first = await repasted(instance, short, FAILED);

    assert.ok(first !== null && first.created);

    const answer = await afterRefusedBatch(
      instance,
      () => deleteItem(first.item.id),
      () => repasted(instance, short, FAILED, "keep"),
    );

    assert.equal(answer, null);

    const again = await repasted(instance, short, FAILED, "keep");

    assert.ok(again !== null && again.created && again.item.id !== first.item.id);
  });

  it("saves a new Item in the same batch Paste when the owner deletes the Item of a known short link right after the keeping insert was refused", async () => {
    const short = "https://t.co/refuseddeletedknown";
    const known = await firstResolved(instance, short, redditPost("refuseddeletedknown"));

    assert.ok(known !== null && known.created);
    await instance.settledItem(known.item.id);

    const answer = await afterRefusedBatch(
      instance,
      () => deleteItem(known.item.id),
      () => instance.send("POST", "/api/items/batch", { links: [{ url: short }] }),
    );

    assert.equal(answer.status, 200);

    const [entry] = BatchResponseSchema.parse(JSON.parse(answer.body)).results;

    assert.ok(entry !== undefined && entry.outcome === "added");
    assert.notEqual(entry.item.id, known.item.id);
  });
});
