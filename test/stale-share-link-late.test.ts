import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { parseLink } from "../src/core/contract/links.ts";
import { whileOpen } from "../src/core/kernel/restore-hold.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";
import { holdLibrary } from "./restore-fixtures.ts";
import {
  FAILED,
  aliasOf,
  aliasRow,
  aliasesAt,
  firstResolved,
  holdingBeforeSecondBatch,
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

  withEachExisting([{}]).forEach(({ existing }) => {
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

  withEachExisting([{}]).forEach(({ existing }) => {
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

  withEachExisting([{}]).forEach(({ existing }) => {
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

    const answer = await holdingBeforeSecondBatch(instance, () =>
      whileOpen(instance.core.db, () =>
        repasted(instance, short, resolvedTo(redditPost("restoreraces")), "keep"),
      ),
    );

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

    const answer = await holdingBeforeSecondBatch(
      instance,
      () =>
        whileOpen(instance.core.db, () =>
          repasted(instance, short, resolvedTo(redditPost("restorerival")), "keep"),
        ),
      () => {
        exec(
          instance,
          "update item_aliases set item_id = ?, address = ? where normalized_url = ?",
          other.item.id,
          otherPost,
          parseLink(short).normalizedUrl,
        );
      },
    );

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
        const answer = await whileOpen(instance.core.db, () =>
          repastedFrom(instance, short, FAILED, snapshot, "keep"),
        );

        assert.deepEqual(answer, { kind: "restoring" });
      } finally {
        exec(instance, "delete from restores where id = 1");
      }

      assert.equal(itemsAt(instance, stale.share), moves ? 0 : 1);
    });
  });
});
