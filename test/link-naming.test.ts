import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ItemReadResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import { Instance } from "./instance.ts";
import {
  failedUnder,
  firstResolved,
  pasteVia,
  redditPost,
  repasted,
  resolvedTo,
  stagedStaleAlias,
} from "./short-link-fixtures.ts";
import { xLink } from "./token-budget-fixtures.ts";

describe("the url filter of the Item list finds the Item that a Paste of the same link names", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const listed = (query: Readonly<Record<string, string>>) =>
    instance.read(
      "GET",
      `/api/items?${new URLSearchParams(query).toString()}`,
      ItemReadResponseSchema,
    );

  const foundByUrl = async (url: string) => (await listed({ url })).items.map(({ id }) => id);

  it("finds a failed Item under a short link with no alias, and the same Item once a Paste promotes it", async () => {
    const short = "https://t.co/namedfailed";
    const failed = await failedUnder(instance, short);

    assert.ok(failed !== null);
    assert.deepEqual(await foundByUrl(short), [failed.item.id]);

    const promoted = await firstResolved(instance, short, xLink(951));

    assert.equal(promoted?.item.id, failed.item.id);
    assert.deepEqual(await foundByUrl(short), [failed.item.id]);
  });

  it("finds the Item the alias names, where a Paste of the short link goes, and not a failed Item under the short link", async () => {
    const short = "https://t.co/namedrival";
    const target = xLink(952);
    const holder = (await pasteVia(instance, target)).saved.item.id;
    const failed = await failedUnder(instance, short);

    assert.ok(failed !== null);
    await firstResolved(instance, short, target);

    assert.deepEqual(await foundByUrl(short), [holder]);
    assert.equal((await pasteVia(instance, short)).saved.item.id, holder);
  });

  it("finds the Item at an ordinary link's own address even when an alias row has that address as its key", async () => {
    const ordinary = xLink(953);
    const held = (await pasteVia(instance, ordinary)).saved.item.id;
    const other = (await pasteVia(instance, xLink(954))).saved.item.id;

    instance.database.exec(
      "insert into item_aliases (normalized_url, address, item_id) values (?, ?, ?)",
      parseLink(ordinary).normalizedUrl,
      xLink(954),
      other,
    );

    assert.deepEqual(await foundByUrl(ordinary), [held]);
    assert.equal((await pasteVia(instance, ordinary)).saved.item.id, held);
  });

  it("finds the Item under the share link an alias ends at until a Paste resolves the short link again and moves the alias", async () => {
    const short = "https://t.co/namedstale";
    const post = redditPost("namedstale");
    const held = await firstResolved(instance, "https://t.co/namedholds", post);
    const stale = await stagedStaleAlias(instance, short);

    assert.ok(held !== null);
    assert.deepEqual(await foundByUrl(short), [stale.id]);

    await repasted(instance, short, resolvedTo(post));

    assert.deepEqual(await foundByUrl(short), [held.item.id]);
  });

  it("finds nothing by a short link once its Item is deleted", async () => {
    const short = "https://t.co/nameddeleted";
    const saved = await firstResolved(instance, short, xLink(955));

    assert.ok(saved !== null);
    assert.equal(
      (await instance.send("DELETE", `/api/items/${String(saved.item.id)}`)).status,
      204,
    );
    assert.deepEqual(await foundByUrl(short), []);
  });

  it("combines a short link with another filter, and counts the Sources the short link leaves", async () => {
    const short = "https://t.co/namedcounted";
    const saved = await firstResolved(instance, short, xLink(956));

    assert.ok(saved !== null);

    const sameSource = await listed({ url: short, source: "x" });
    const otherSource = await listed({ url: short, source: "reddit" });

    assert.deepEqual(
      sameSource.items.map(({ id }) => id),
      [saved.item.id],
    );
    assert.deepEqual(otherSource.items, []);
    assert.deepEqual(
      otherSource.counts?.sources.filter(({ count }) => count > 0),
      [{ key: "x", count: 1 }],
    );
  });
});
