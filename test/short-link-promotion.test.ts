import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { parseLink } from "../src/core/contract/links.ts";
import type { Existing } from "../src/features/item/core/item-rows.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";
import {
  FAILED,
  aliasRow,
  aliasesAt,
  failedUnder,
  firstResolved,
  itemsAt,
  pasteVia,
  repasted,
} from "./short-link-fixtures.ts";
import { xLink } from "./token-budget-fixtures.ts";

describe("a short link is kept as an alias of the Item it made or reached, and a failed Item under the short link becomes the Item the link resolves to", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  const failedAt = async (short: string) => {
    const saved = await failedUnder(instance, short);

    assert.ok(saved !== null && saved.created);

    return saved.item.id;
  };

  it("gives the failed Item the identity, kind and Source of the address the short link resolved to, writes the alias, and makes no second Item", async () => {
    const short = "https://t.co/promoteme";
    const target = xLink(901);
    const failed = await failedAt(short);
    const total = await instance.itemTotal();

    const saved = await firstResolved(instance, short, target);

    assert.ok(saved !== null && saved.item.id === failed && !saved.created);
    assert.equal(await instance.itemTotal(), total);

    const item = await instance.detail(failed);

    assert.equal(item.normalizedUrl, parseLink(target).normalizedUrl);
    assert.equal(item.source, "x");
    assert.equal(item.kind, parseLink(target).kind);
    assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, target, failed)]);
  });

  it("reaches the aliased Item when the short link is pasted again", async () => {
    const short = "https://t.co/pastedagain";
    const aliased = await firstResolved(instance, short, xLink(907));

    assert.ok(aliased !== null);
    assert.deepEqual(
      aliasesAt(instance, short).map(({ item_id: id }) => id),
      [aliased.item.id],
    );

    const total = await instance.itemTotal();

    const { status, saved } = await pasteVia(instance, short);

    assert.equal(status, 200);
    assert.equal(saved.item.id, aliased.item.id);
    assert.equal(await instance.itemTotal(), total);
  });

  it("keeps a failed Item that holds an earlier successful fetch under the short link, and saves the resolved address as a new Item", async () => {
    const short = "https://t.co/fetchedbefore";
    const target = xLink(908);
    const failed = await failedAt(short);

    exec(instance, "update items set fetched_at = ? where id = ?", Date.now(), failed);

    const total = await instance.itemTotal();
    const saved = await firstResolved(instance, short, target);

    assert.ok(saved !== null && saved.created && saved.item.id !== failed);
    assert.equal(await instance.itemTotal(), total + 1);
    assert.equal((await instance.detail(failed)).normalizedUrl, parseLink(short).normalizedUrl);
    assert.deepEqual(
      aliasesAt(instance, short).map(({ item_id: id }) => id),
      [saved.item.id],
    );
  });

  it("leaves the failed Item for the owner to delete when another Item already holds the resolved identity, and records the alias on that Item", async () => {
    const short = "https://t.co/rivalheld";
    const target = xLink(902);
    const holder = (await pasteVia(instance, target)).saved.item.id;
    const failed = await failedAt(short);
    const total = await instance.itemTotal();

    const saved = await firstResolved(instance, short, target);

    assert.ok(saved !== null && saved.item.id === holder);
    assert.equal(await instance.itemTotal(), total);
    assert.equal((await instance.detail(failed)).normalizedUrl, parseLink(short).normalizedUrl);
    assert.deepEqual(
      aliasesAt(instance, short).map(({ item_id: id }) => id),
      [holder],
    );
  });

  it("gives a second short link to the same target its own alias on the same Item, and keeps the first address of an alias", async () => {
    const target = xLink(903);
    const first = await firstResolved(instance, "https://t.co/firstway", target);
    const second = await firstResolved(instance, "https://t.co/secondway", target);
    const again = await firstResolved(instance, "https://t.co/firstway", target, `${target}?s=20`);

    assert.ok(first !== null && second !== null && again !== null);
    assert.deepEqual([second.item.id, again.item.id], [first.item.id, first.item.id]);
    assert.deepEqual(
      aliasesAt(instance, "https://t.co/firstway").map(({ address }) => address),
      [target],
    );
    assert.deepEqual(
      aliasesAt(instance, "https://t.co/secondway").map(({ item_id: id }) => id),
      [first.item.id],
    );
  });

  const refusedRival = async (short: string, first: string, second: string, existing: Existing) => {
    const aliased = await firstResolved(instance, short, first);

    assert.ok(aliased !== null, "the first resolution saves an Item");

    const total = await instance.itemTotal();
    const saved = await firstResolved(instance, short, second, second, existing);

    assert.equal(saved, null);
    assert.equal(await instance.itemTotal(), total);
    assert.equal(itemsAt(instance, second), 0);
    assert.equal(
      (await instance.detail(aliased.item.id)).normalizedUrl,
      parseLink(first).normalizedUrl,
    );
    assert.deepEqual(aliasesAt(instance, short), [aliasRow(short, first, aliased.item.id)]);
  };

  it("refuses a second resolution of an aliased short link to another identity, and leaves the alias and the Items as they were", () =>
    refusedRival("https://t.co/rivalrefresh", xLink(909), xLink(910), "refresh"));

  it("refuses a second resolution of an aliased short link to another identity when the Paste keeps an existing Item", () =>
    refusedRival("https://t.co/rivalkeep", xLink(911), xLink(912), "keep"));

  it("saves a failed Item under the short link when the resolution fails and no alias exists", async () => {
    const short = "https://t.co/neverresolved";
    const saved = await repasted(instance, short, FAILED);

    assert.ok(saved !== null && saved.created);
    assert.equal(
      (await instance.detail(saved.item.id)).normalizedUrl,
      parseLink(short).normalizedUrl,
    );
    assert.deepEqual(aliasesAt(instance, short), []);
  });

  it("makes no failed Item for a short link that already has an alias", async () => {
    const short = "https://t.co/aliasedfirst";

    await firstResolved(instance, short, xLink(904));

    const total = await instance.itemTotal();

    const saved = await failedUnder(instance, short);

    assert.equal(saved, null);
    assert.equal(await instance.itemTotal(), total);
  });

  it("deletes the aliases of an Item in the same batch that deletes the Item", async () => {
    const short = "https://t.co/deleteme";
    const saved = await firstResolved(instance, short, xLink(906));

    assert.ok(saved !== null, "the short link saves an Item");

    await instance.settledItem(saved.item.id);
    assert.equal(aliasesAt(instance, short).length, 1);
    assert.equal(
      (await instance.send("DELETE", `/api/items/${String(saved.item.id)}`)).status,
      204,
    );
    assert.deepEqual(aliasesAt(instance, short), []);
  });
});
