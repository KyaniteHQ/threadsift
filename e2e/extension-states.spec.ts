import { expect, test } from "@playwright/test";

import { createToken, revokeToken } from "./access-helpers.ts";
import { itemOf, listAll, postLink } from "./api.ts";
import { BIG_PAGE_TIMEOUT_MS, ESSAY, WAR_AND_PEACE } from "./articles.ts";
import { ACTION_TEXT, type Extension, loadExtension } from "./extension.ts";
import { jobsOf } from "./ingest.ts";
import { type Library, closeLibrary, openLibrary } from "./media-pages.ts";

test.describe.configure({ timeout: 360_000 });

const GITHUB_PAGE = "https://github.com/kepano/defuddle";

let library: Library;
let extension: Extension | null = null;

test.beforeEach(async () => {
  library = await openLibrary();
});

test.afterEach(async () => {
  await extension?.close();
  extension = null;
  await closeLibrary(library);
});

async function configured(grants: boolean): Promise<{ extension: Extension; tokenId: number }> {
  const { owner, instance } = library;
  const loaded = await loadExtension({ instanceUrl: grants ? instance.url : null });
  extension = loaded;
  const { token, value } = await createToken(owner, "Extension");

  if (grants) await loaded.configure(instance.url, value);
  else await loaded.storeWithoutAsking(instance.url, value);

  return { extension: loaded, tokenId: token.id };
}

test("a revoked token shows its refusal, a new link stores nothing and an existing Item stays as it was", async () => {
  const { owner, instance } = library;
  const { extension: loaded, tokenId } = await configured(true);
  const essay = await loaded.tab(ESSAY);
  const first = await loaded.press(essay);

  await expect.poll(() => first.status()).toBe(ACTION_TEXT.saved);
  const [saved] = await listAll(owner);
  expect(saved).toBeDefined();
  const id = saved?.id ?? 0;
  await expect.poll(async () => (await itemOf(owner, id)).status).toBe("ready");

  const before = await itemOf(owner, id);
  const jobs = jobsOf(id, instance);

  expect((await revokeToken(owner, tokenId)).status()).toBe(204);

  const again = await loaded.press(essay);
  await expect.poll(() => again.status()).toBe(ACTION_TEXT.tokenRefused);

  const another = await loaded.tab("https://example.com/");
  const refused = await loaded.press(another);
  await expect.poll(() => refused.status()).toBe(ACTION_TEXT.tokenRefused);

  expect(await listAll(owner)).toHaveLength(1);
  expect(await itemOf(owner, id)).toEqual(before);
  expect(jobsOf(id, instance)).toEqual(jobs);
});

test("a page over the size limit shows its refusal and the Item and the library stay as they were", async () => {
  const { owner } = library;
  const { body } = await postLink(owner, WAR_AND_PEACE, BIG_PAGE_TIMEOUT_MS);
  const before = await itemOf(owner, body.item.id);

  const { extension: loaded } = await configured(true);
  const tab = await loaded.tab(WAR_AND_PEACE);
  const popup = await loaded.press(tab);

  await expect
    .poll(() => popup.status(), { timeout: BIG_PAGE_TIMEOUT_MS })
    .toBe(ACTION_TEXT.tooLarge);
  expect(await listAll(owner)).toHaveLength(1);
  expect(await itemOf(owner, body.item.id)).toEqual(before);
});

test("without an address and a token the popup says so, and nothing is saved", async () => {
  const { owner, instance } = library;
  const loaded = await loadExtension({ instanceUrl: instance.url });
  extension = loaded;

  const popup = await loaded.press(await loaded.tab(ESSAY));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.notConfigured);
  expect(await listAll(owner)).toEqual([]);
});

test("an address the browser has not been allowed to reach shows its refusal, and nothing is saved", async () => {
  const { owner } = library;
  const { extension: loaded } = await configured(false);

  const popup = await loaded.press(await loaded.tab(ESSAY));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.accessMissing);
  expect(await listAll(owner)).toEqual([]);
});

test("a browser page the Extension may not read shows its refusal, and nothing is saved", async () => {
  const { owner } = library;
  const { extension: loaded } = await configured(true);

  const popup = await loaded.press(await loaded.tab("chrome://version/"));

  await expect.poll(() => popup.status()).toBe(ACTION_TEXT.pageBlocked);
  expect(await listAll(owner)).toEqual([]);
});

test("a GitHub link and a page on the owner's own network show their refusals, and nothing is saved", async () => {
  const { owner, instance } = library;
  const { extension: loaded } = await configured(true);

  const github = await loaded.press(await loaded.tab(GITHUB_PAGE));
  await expect.poll(() => github.status()).toBe(ACTION_TEXT.unsupportedLink);

  const local = await loaded.press(await loaded.tab(`${instance.url}/`));
  await expect.poll(() => local.status()).toBe(ACTION_TEXT.privateLink);

  expect(await listAll(owner)).toEqual([]);
});
