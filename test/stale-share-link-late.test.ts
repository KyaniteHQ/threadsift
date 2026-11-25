import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { parseLink } from "../src/core/contract/links.ts";
import { whileOpen } from "../src/core/kernel/restore-hold.ts";
import { Instance } from "./instance.ts";
import { holdLibrary, releaseLibrary } from "./restore-fixtures.ts";
import {
  EXISTING,
  FAILED,
  TIMED_OUT,
  aliasOf,
  aliasRow,
  aliasesAt,
  beforeSecondBatch,
  firstResolved,
  itemsAt,
  pasteVia,
  redditPost,
  repasted,
  repastedFrom,
  resolvedTo,
  stagedStaleAlias,
  stillAtShareLink,
  withEachExisting,
} from "./short-link-fixtures.ts";

describe("a Paste of a stale alias writes nothing that another Paste or a Restore has made out of date", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const LATE = [
    { moved: "the Item moved through the same alias", through: "alias", remains: 0 },
    { moved: "a second short link moved the Item", through: "second", remains: 0 },
    { moved: "the alias moved to the Item that holds the post", through: "holder", remains: 1 },
    {
      moved: "the alias took another spelling of the post its Item holds",
      through: "spelled",
      remains: 0,
    },
  ] as const;

  withEachExisting(LATE).forEach(({ moved, through, remains, existing }) => {
    it(`makes no Item when a late failed resolution read its alias before ${moved}, for a ${existing} Paste`, async () => {
      const tag = `${through}${existing}`;
      const short = `https://t.co/late${tag}`;
      const post = redditPost(`late${tag}`);
      const stale = await stagedStaleAlias(instance, short);
      const held =
        through === "holder"
          ? await firstResolved(instance, `https://t.co/lateholds${tag}`, post)
          : null;

      const mover = `https://t.co/lateother${tag}`;

      const sharedItemMoved = async () => {
        await firstResolved(instance, mover, stale.share);
        await repasted(instance, mover, resolvedTo(post));
      };

      if (through === "spelled") await sharedItemMoved();

      const snapshot = await aliasOf(instance, short);

      if (through === "second") await sharedItemMoved();
      else
        await repasted(
          instance,
          short,
          resolvedTo(through === "spelled" ? `${post}?utm_source=share` : post),
        );

      const total = await instance.itemTotal();
      const movedAlias = aliasesAt(instance, short);

      assert.equal(await repastedFrom(instance, short, FAILED, snapshot, existing), null);
      assert.equal(await instance.itemTotal(), total);
      assert.equal(itemsAt(instance, stale.share), remains);
      assert.deepEqual(aliasesAt(instance, short), movedAlias);

      const again =
        through === "second"
          ? (await repasted(instance, short, FAILED, existing))?.item.id
          : (await pasteVia(instance, short)).saved.item.id;

      assert.equal(again, held?.item.id ?? stale.id);
    });
  });

  EXISTING.forEach((existing) => {
    it(`makes no Item and promotes nothing when a late resolution to another post read its alias before the alias moved to another Item, for a ${existing} Paste`, async () => {
      const short = `https://t.co/laterival${existing}`;
      const heldPost = redditPost(`laterivalheld${existing}`);
      const stale = await stagedStaleAlias(instance, short);
      const snapshot = await aliasOf(instance, short);
      const held = await firstResolved(
        instance,
        `https://t.co/laterivalholds${existing}`,
        heldPost,
      );

      assert.ok(held !== null);
      await repasted(instance, short, resolvedTo(heldPost));

      const total = await instance.itemTotal();
      const late = resolvedTo(redditPost(`laterivallate${existing}`));

      assert.equal(await repastedFrom(instance, short, late, snapshot, existing), null);
      assert.equal(await instance.itemTotal(), total);
      await stillAtShareLink(instance, stale.id, stale.share);
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, heldPost, held.item.id)]);
    });
  });

  EXISTING.forEach((existing) => {
    it(`reaches the Item that another Paste moved the alias to and leaves the alias as that Paste wrote it, when the late resolution is the post that Item holds, for a ${existing} Paste`, async () => {
      const short = `https://t.co/samepost${existing}`;
      const post = redditPost(`samepost${existing}`);
      const stale = await stagedStaleAlias(instance, short);
      const snapshot = await aliasOf(instance, short);
      const held = await firstResolved(instance, `https://t.co/samepostholds${existing}`, post);

      assert.ok(held !== null);
      await repasted(instance, short, resolvedTo(post));

      const total = await instance.itemTotal();
      const saved = await repastedFrom(
        instance,
        short,
        resolvedTo(`${post}?context=3`),
        snapshot,
        existing,
      );

      assert.ok(saved !== null && saved.item.id === held.item.id && !saved.created);
      assert.equal(await instance.itemTotal(), total);
      await stillAtShareLink(instance, stale.id, stale.share);
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, post, held.item.id)]);
    });
  });

  EXISTING.forEach((existing) => {
    it(`saves a new Item at the post and records the alias when the owner deleted the Item of a stale alias while the resolution ran, for a ${existing} Paste`, async () => {
      const short = `https://t.co/latedeleted${existing}`;
      const post = redditPost(`latedeleted${existing}`);
      const stale = await stagedStaleAlias(instance, short);
      const snapshot = await aliasOf(instance, short);

      assert.equal((await instance.send("DELETE", `/api/items/${String(stale.id)}`)).status, 204);
      assert.deepEqual(aliasesAt(instance, short), []);

      const total = await instance.itemTotal();
      const saved = await repastedFrom(instance, short, resolvedTo(post), snapshot, existing);

      assert.ok(saved !== null && saved.created && saved.item.id !== stale.id);
      assert.equal(await instance.itemTotal(), total + 1);
      assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, post, saved.item.id)]);
    });
  });

  it("answers restoring when a Restore starts before a keeping Paste promotes the Item of a stale alias", async () => {
    const short = "https://t.co/restoreraces";
    const stale = await stagedStaleAlias(instance, short);

    const { answer, batches } = await beforeSecondBatch(instance, { hold: true }, () =>
      whileOpen(() => repasted(instance, short, resolvedTo(redditPost("restoreraces")), "keep")),
    );

    assert.equal(batches, 2);
    assert.deepEqual(answer, { kind: "restoring" });
    await stillAtShareLink(instance, stale.id, stale.share);
    assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, stale.share, stale.id)]);
  });

  it("answers restoring, not an answer from a lost race, when the alias moves as a Restore starts", async () => {
    const short = "https://t.co/restorerival";
    const otherPost = redditPost("restoreotherpost");
    const stale = await stagedStaleAlias(instance, short);
    const other = await firstResolved(instance, "https://t.co/restoreother", otherPost);

    assert.ok(other !== null);

    const { answer, batches } = await beforeSecondBatch(
      instance,
      {
        hold: true,
        staged: () => {
          instance.database.exec(
            "update item_aliases set item_id = ?, address = ? where normalized_url = ?",
            other.item.id,
            otherPost,
            parseLink(short).normalizedUrl,
          );
        },
      },
      () =>
        whileOpen(() => repasted(instance, short, resolvedTo(redditPost("restorerival")), "keep")),
    );

    assert.equal(batches, 2);
    assert.deepEqual(answer, { kind: "restoring" });
    await stillAtShareLink(instance, stale.id, stale.share);
  });

  [
    { moves: false, name: "the alias is as the Paste read it" },
    { moves: true, name: "the alias moved after the Paste read it" },
  ].forEach(({ moves, name }) => {
    it(`answers restoring for a keeping Paste whose resolution failed while a Restore holds the library, when ${name}`, async () => {
      const short = `https://t.co/keptrestore${String(moves)}`;
      const stale = await stagedStaleAlias(instance, short);
      const snapshot = await aliasOf(instance, short);

      if (moves) await repasted(instance, short, resolvedTo(redditPost("keptrestoremoved")));

      holdLibrary(instance, "running", null);

      try {
        const answer = await whileOpen(() =>
          repastedFrom(instance, short, FAILED, snapshot, "keep"),
        );

        assert.deepEqual(answer, { kind: "restoring" });
      } finally {
        releaseLibrary(instance);
      }

      assert.equal(itemsAt(instance, stale.share), moves ? 0 : 1);
    });
  });

  const deleteItem = async (id: number) => {
    const deleted = await instance.send("DELETE", `/api/items/${String(id)}`);

    assert.equal(deleted.status, 204);
  };

  const PendingSchema = z.object({ pending_digest: z.string().nullable() });

  const pendingDigestOf = (id: number) =>
    instance.database.rows(PendingSchema, "select pending_digest from items where id = ?", id);

  it("answers restoring and leaves the failed Item as it was when a Restore starts before a refreshing Paste of its short link writes", async () => {
    const short = "https://t.co/failedrestore";
    const first = await repasted(instance, short, TIMED_OUT);

    assert.ok(first !== null && first.created);
    instance.database.exec(
      "update items set pending_digest = ? where id = ?",
      JSON.stringify({ title: "A Digest the failed Item kept" }),
      first.item.id,
    );

    const stored = await instance.detail(first.item.id);
    const pending = pendingDigestOf(first.item.id);

    assert.notDeepEqual(pending, [{ pending_digest: null }]);

    const { answer, batches } = await beforeSecondBatch(instance, { hold: true }, () =>
      whileOpen(() => repasted(instance, short, FAILED)),
    );

    assert.equal(batches, 2);
    assert.deepEqual(answer, { kind: "restoring" });
    assert.deepEqual(await instance.detail(first.item.id), stored);
    assert.deepEqual(pendingDigestOf(first.item.id), pending);
  });

  it("saves a new failed Item in the same Paste when the owner deletes the failed Item before a refreshing Paste of its short link writes", async () => {
    const short = "https://t.co/faileddeleted";
    const first = await pasteVia(instance, short);

    assert.equal(first.status, 201);

    const { answer: again, batches } = await beforeSecondBatch(
      instance,
      { staged: () => deleteItem(first.saved.item.id) },
      () => pasteVia(instance, short),
    );

    assert.ok(batches >= 3);
    assert.equal(again.status, 201);
    assert.notEqual(again.saved.item.id, first.saved.item.id);
    assert.equal(itemsAt(instance, short), 1);
    assert.equal(
      (await instance.detail(again.saved.item.id)).normalizedUrl,
      parseLink(short).normalizedUrl,
    );
  });
});
