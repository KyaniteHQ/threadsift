import { expect, test } from "@playwright/test";

import { RETRY_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { itemOf, listAll, postLink, postLinkRaw, settled } from "./api.ts";
import { countOf } from "./deletion-seed.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import {
  DEAD_SHORT_LINK,
  MOVED_PAGE,
  MOVED_PAGE_NORMALIZED,
  SHORT_LINK,
  SHORT_LINK_TARGET,
  SHORT_LINK_TARGET_NORMALIZED,
  SLOW_SHORT_LINK,
  SLOW_SHORT_LINK_TARGET,
  TIMEOUT_SHORT_LINK,
  TWIN_SHORT_LINK,
  TWIN_SHORT_LINK_TARGET,
} from "./links.ts";
import { openLibrary, row } from "./reader.ts";
import { aliasesOf, fetchAddressesOf, rememberAlias } from "./short-links.ts";

test.describe.configure({ timeout: 240_000 });

test.use({ trace: "off", video: "off", screenshot: "off" });

const ALIAS_WRITE_DELAY_MS = 1500;

let screen: FreshScreen;

function itemsAt(normalizedUrl: string): number {
  return countOf(
    screen,
    `SELECT count(*) AS n FROM items WHERE normalized_url = '${normalizedUrl}'`,
  );
}

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
});

test.afterEach(async () => {
  await screen.close();
});

async function failedShortLinkItem(shortLink: string) {
  const { request } = screen.context;
  const failed = await postLinkRaw(request, DEAD_SHORT_LINK);
  const { id } = failed.body.item;

  expect([failed.status, failed.body.item.normalizedUrl]).toEqual([201, DEAD_SHORT_LINK]);

  screen.fresh.sql(
    `UPDATE items SET normalized_url = '${shortLink}', original_url = '${shortLink}' WHERE id = ${id}`,
  );

  return id;
}

async function pagedItem() {
  const { body } = await postLink(screen.context.request, MOVED_PAGE);

  expect(body.item.normalizedUrl).toBe(MOVED_PAGE_NORMALIZED);

  return body.item.id;
}

function madeThrough(id: number, shortLink: string): void {
  screen.fresh.sql(`UPDATE items SET original_url = '${shortLink}' WHERE id = ${id}`);
  rememberAlias(screen.fresh, shortLink, MOVED_PAGE, id);
}

test("two short links to one target are one Item with two aliases, and pasting either again refreshes that Item from its own address", async () => {
  const { request } = screen.context;
  const first = await postLinkRaw(request, SHORT_LINK);
  const { id } = first.body.item;

  expect(first.status).toBe(201);
  await settled(request, id);
  expect(aliasesOf(screen)).toEqual([{ normalizedUrl: SHORT_LINK, itemId: id }]);

  const twin = await postLinkRaw(request, TWIN_SHORT_LINK);

  expect([twin.status, twin.body.item.id]).toEqual([200, id]);
  await settled(request, id);

  expect(aliasesOf(screen)).toEqual([
    { normalizedUrl: SHORT_LINK, itemId: id },
    { normalizedUrl: TWIN_SHORT_LINK, itemId: id },
  ]);

  const again = await postLinkRaw(request, SHORT_LINK);

  expect([again.status, again.body.item.id]).toEqual([200, id]);
  await settled(request, id);
  expect(fetchAddressesOf(screen, id)).toEqual([
    SHORT_LINK_TARGET,
    TWIN_SHORT_LINK_TARGET,
    SHORT_LINK_TARGET,
  ]);
  expect(await listAll(request)).toHaveLength(1);
});

test("Try again on an Item whose short link has died reaches the same Item and makes no failed Item under the short link", async () => {
  const { request } = screen.context;
  const { page } = screen;
  const id = await pagedItem();
  madeThrough(id, DEAD_SHORT_LINK);

  screen.fresh.sql(`UPDATE items SET status = 'failed', reason = 'network' WHERE id = ${id}`);
  await openLibrary(page, 1440);

  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes("/api/items"),
  );

  await row(page, id).getByRole("button", { name: RETRY_LABEL, exact: true }).click();

  expect((await answered).status()).toBe(200);
  expect(await settled(request, id)).toMatchObject({ status: "ready", fetch: "ok" });
  expect(fetchAddressesOf(screen, id)).toEqual([MOVED_PAGE, MOVED_PAGE]);
  expect(itemsAt(DEAD_SHORT_LINK)).toBe(0);
  expect(await listAll(request)).toHaveLength(1);
});

test("a short link whose target moved keeps its Item, and the new target is not saved", async () => {
  const { request } = screen.context;
  const id = await pagedItem();
  madeThrough(id, SHORT_LINK);
  const { title } = await itemOf(request, id);

  const pasted = await postLinkRaw(request, SHORT_LINK);

  expect([pasted.status, pasted.body.item.id]).toEqual([200, id]);
  expect(await settled(request, id)).toMatchObject({ title, normalizedUrl: MOVED_PAGE_NORMALIZED });
  expect(itemsAt(SHORT_LINK_TARGET_NORMALIZED)).toBe(0);
  expect(await listAll(request)).toHaveLength(1);
});

test("a short link that failed once and now resolves turns its failed Item into the resolved one", async () => {
  const { request } = screen.context;
  const id = await failedShortLinkItem(TWIN_SHORT_LINK);

  const pasted = await postLinkRaw(request, TWIN_SHORT_LINK);

  expect([pasted.status, pasted.body.item.id]).toEqual([200, id]);

  expect(await settled(request, id)).toMatchObject({
    normalizedUrl: SHORT_LINK_TARGET_NORMALIZED,
    status: "ready",
    fetch: "ok",
  });

  expect(aliasesOf(screen)).toEqual([{ normalizedUrl: TWIN_SHORT_LINK, itemId: id }]);
  expect(await listAll(request)).toHaveLength(1);
});

test("a short link that failed once and now resolves to an Item that exists reaches that Item and leaves the failed one", async () => {
  const { request } = screen.context;
  const resolved = await postLink(request, SHORT_LINK_TARGET);
  const failed = await failedShortLinkItem(TWIN_SHORT_LINK);

  const pasted = await postLinkRaw(request, TWIN_SHORT_LINK);

  expect(pasted.status).toBe(200);
  expect(pasted.body.item.id).toBe(resolved.body.item.id);
  await settled(request, resolved.body.item.id);
  expect(aliasesOf(screen)).toEqual([
    { normalizedUrl: TWIN_SHORT_LINK, itemId: resolved.body.item.id },
  ]);

  expect((await listAll(request)).map(({ id }) => id).toSorted((a, b) => a - b)).toEqual(
    [resolved.body.item.id, failed].toSorted((a, b) => a - b),
  );

  expect(itemsAt(TWIN_SHORT_LINK)).toBe(1);
});

test("three first saves of two short links to one target at once end with one Item and two aliases", async () => {
  const { request } = screen.context;

  const answers = await Promise.all(
    [SHORT_LINK, TWIN_SHORT_LINK, SHORT_LINK].map((url) => postLinkRaw(request, url)),
  );

  const ids = answers.map(({ body }) => body.item.id);
  const [id = 0] = ids;

  expect(answers.map(({ status }) => status).toSorted((a, b) => a - b)).toEqual([200, 200, 201]);
  expect(ids).toEqual([id, id, id]);
  await settled(request, id);
  expect(await listAll(request)).toHaveLength(1);
  expect(aliasesOf(screen).map(({ itemId }) => itemId)).toEqual([id, id]);
  expect(fetchAddressesOf(screen, id).length).toBeGreaterThan(0);
});

async function pasteWhileAliasAppears(shortLink: string, id: number) {
  const inFlight = postLinkRaw(screen.context.request, shortLink);

  await new Promise<void>((resolve) => {
    setTimeout(resolve, ALIAS_WRITE_DELAY_MS);
  });

  rememberAlias(screen.fresh, shortLink, MOVED_PAGE, id);

  return inFlight;
}

test("a slow short link whose alias is written while it resolves returns the aliased Item and makes no second one", async () => {
  const id = await pagedItem();
  const pasted = await pasteWhileAliasAppears(SLOW_SHORT_LINK, id);

  expect([pasted.status, pasted.body.item.id]).toEqual([200, id]);
  expect(itemsAt(SLOW_SHORT_LINK_TARGET)).toBe(0);
  expect(await listAll(screen.context.request)).toHaveLength(1);
});

test("a short link whose resolution times out after its alias was written returns the aliased Item and makes no failed Item", async () => {
  const id = await pagedItem();
  const pasted = await pasteWhileAliasAppears(TIMEOUT_SHORT_LINK, id);

  expect([pasted.status, pasted.body.item.id]).toEqual([200, id]);
  expect(itemsAt(TIMEOUT_SHORT_LINK)).toBe(0);
  expect(await listAll(screen.context.request)).toHaveLength(1);
});

test("deleting an Item deletes its aliases, and the short link then makes a new Item", async () => {
  const { request } = screen.context;
  const first = await postLinkRaw(request, SHORT_LINK);
  const { id } = first.body.item;
  await settled(request, id);
  await postLinkRaw(request, TWIN_SHORT_LINK);
  expect(aliasesOf(screen)).toHaveLength(2);

  const removed = await request.delete(`/api/items/${id}`, {
    headers: { "sec-fetch-site": "same-origin" },
  });

  expect(removed.status()).toBe(204);
  expect(aliasesOf(screen)).toEqual([]);

  const again = await postLinkRaw(request, SHORT_LINK);

  expect(again.status).toBe(201);
  expect(again.body.item.id).not.toBe(id);
});
