import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { SavedItemResponseSchema } from "../src/core/contract/item-route-wire.ts";
import { parseLink } from "../src/core/contract/links.ts";
import { saveResolved, saveUnresolved } from "../src/features/paste/core/item-save.ts";
import { Instance } from "./instance.ts";
import { itemTotal } from "./restore-fixtures.ts";
import { count, exec, rows } from "./sqlite-fixtures.ts";
import { xLink } from "./token-budget-fixtures.ts";

const AliasSchema = z.object({
  normalized_url: z.string(),
  address: z.string(),
  item_id: z.number(),
});

describe("a short link is kept as an alias of the Item it made or reached, and a failed Item under the short link becomes the Item the link resolves to", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const unresolvedSave = (short: string) =>
    saveUnresolved(instance.core, {
      paste: { address: short, addedByToken: null },
      link: parseLink(short),
      fetched: { status: "unresolved" },
      existing: "refresh",
    });

  const failedAt = async (short: string) => {
    const saved = await unresolvedSave(short);

    assert.ok(saved !== null && saved.created);

    return saved.item.id;
  };

  const resolved = (short: string, target: string, address = target) =>
    saveResolved(instance.core, {
      shortLink: parseLink(short).normalizedUrl,
      paste: { originalUrl: short, address, digest: undefined, addedByToken: null },
      link: parseLink(target),
      existing: "refresh",
    });

  const aliasesOf = (short: string) =>
    rows(
      instance,
      AliasSchema,
      "select normalized_url, address, item_id from item_aliases where normalized_url = ?",
      parseLink(short).normalizedUrl,
    );

  const pasteVia = async (short: string) => {
    const answer = await instance.send("POST", "/api/items", { url: short });

    return { status: answer.status, saved: SavedItemResponseSchema.parse(JSON.parse(answer.body)) };
  };

  it("gives the failed Item the identity, kind and Source of the address the short link resolved to, writes the alias, and makes no second Item", async () => {
    const short = "https://t.co/promoteme";
    const target = xLink(901);
    const failed = await failedAt(short);
    const total = await itemTotal(instance);

    const saved = await resolved(short, target);

    assert.ok(saved !== null && saved.item.id === failed && !saved.created);
    assert.equal(await itemTotal(instance), total);

    const item = await instance.detail(failed);

    assert.equal(item.normalizedUrl, parseLink(target).normalizedUrl);
    assert.equal(item.source, "x");
    assert.equal(item.kind, parseLink(target).kind);
    assert.deepEqual(aliasesOf(short), [
      { normalized_url: parseLink(short).normalizedUrl, address: target, item_id: failed },
    ]);
  });

  it("reaches the aliased Item, resolving nothing, when the short link is pasted again", async () => {
    const short = "https://t.co/pastedagain";
    const aliased = await resolved(short, xLink(907));

    assert.ok(aliased !== null);
    assert.deepEqual(
      aliasesOf(short).map(({ item_id: id }) => id),
      [aliased.item.id],
    );

    const total = await itemTotal(instance);

    const otherFetches = () =>
      count(
        instance,
        "select count(*) as n from jobs where kind = 'fetch' and item_id <> ?",
        aliased.item.id,
      );

    const others = otherFetches();
    const { status, saved } = await pasteVia(short);

    assert.equal(status, 200);
    assert.equal(saved.item.id, aliased.item.id);
    assert.equal(await itemTotal(instance), total);
    assert.equal(otherFetches(), others);
  });

  it("keeps a failed Item that holds an earlier successful fetch under the short link, and saves the resolved address as a new Item", async () => {
    const short = "https://t.co/fetchedbefore";
    const target = xLink(908);
    const failed = await failedAt(short);

    exec(instance, "update items set fetched_at = ? where id = ?", Date.now(), failed);

    const total = await itemTotal(instance);
    const saved = await resolved(short, target);

    assert.ok(saved !== null && saved.created && saved.item.id !== failed);
    assert.equal(await itemTotal(instance), total + 1);
    assert.equal((await instance.detail(failed)).normalizedUrl, parseLink(short).normalizedUrl);
    assert.deepEqual(
      aliasesOf(short).map(({ item_id: id }) => id),
      [saved.item.id],
    );
  });

  it("leaves the failed Item for the owner to delete when another Item already holds the resolved identity, and records the alias on that Item", async () => {
    const short = "https://t.co/rivalheld";
    const target = xLink(902);
    const holder = (await pasteVia(target)).saved.item.id;
    const failed = await failedAt(short);
    const total = await itemTotal(instance);

    const saved = await resolved(short, target);

    assert.ok(saved !== null && saved.item.id === holder);
    assert.equal(await itemTotal(instance), total);
    assert.equal((await instance.detail(failed)).normalizedUrl, parseLink(short).normalizedUrl);
    assert.deepEqual(
      aliasesOf(short).map(({ item_id: id }) => id),
      [holder],
    );
  });

  it("gives a second short link to the same target its own alias on the same Item, and keeps the first address of an alias", async () => {
    const target = xLink(903);
    const first = await resolved("https://t.co/firstway", target);
    const second = await resolved("https://t.co/secondway", target);
    const again = await resolved("https://t.co/firstway", target, `${target}?s=20`);

    assert.ok(first !== null && second !== null && again !== null);
    assert.deepEqual([second.item.id, again.item.id], [first.item.id, first.item.id]);
    assert.deepEqual(
      aliasesOf("https://t.co/firstway").map(({ address }) => address),
      [target],
    );
    assert.deepEqual(
      aliasesOf("https://t.co/secondway").map(({ item_id: id }) => id),
      [first.item.id],
    );
  });

  it("makes no failed Item for a short link that already has an alias", async () => {
    const short = "https://t.co/aliasedfirst";

    await resolved(short, xLink(904));

    const total = await itemTotal(instance);

    const saved = await unresolvedSave(short);

    assert.equal(saved, null);
    assert.equal(await itemTotal(instance), total);
  });

  it("deletes the aliases of an Item in the same batch that deletes the Item", async () => {
    const short = "https://t.co/deleteme";
    const saved = await resolved(short, xLink(906));

    assert.ok(saved !== null, "the short link saves an Item");

    await instance.settledItem(saved.item.id);
    assert.equal(aliasesOf(short).length, 1);
    assert.equal(
      (await instance.send("DELETE", `/api/items/${String(saved.item.id)}`)).status,
      204,
    );
    assert.deepEqual(aliasesOf(short), []);
  });
});
