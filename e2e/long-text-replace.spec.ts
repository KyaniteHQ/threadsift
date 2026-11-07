import { type APIRequestContext, expect, test } from "@playwright/test";

import { type Instance, launchFresh, newCode } from "./access.ts";
import { itemOf, postLinkRaw } from "./api.ts";
import { ESSAY, ESSAY_SENTENCE } from "./articles.ts";
import { digestOf, longText, ownerOf, postTextOf, storeLongArticle } from "./files.ts";
import { jobsOf } from "./ingest.ts";

let instance: Instance;
let owner: APIRequestContext;

test.beforeAll(async () => {
  const code = newCode();
  instance = launchFresh(code);
  owner = await ownerOf(instance, code, "r".repeat(20));
});

test.afterAll(async () => {
  await owner.dispose();
  instance.stop();
});

async function refreshedBy(url: string, title: string, bytes: Uint8Array) {
  const { id, key } = storeLongArticle(instance, { url, title, bytes });

  expect(instance.readFile(key)?.length, "the seeded file").toBe(bytes.length);
  expect((await postLinkRaw(owner, url)).status).toBe(200);
  await expect
    .poll(() => jobsOf(id, instance, "fetch").map((job) => job.state), { timeout: 60_000 })
    .toEqual(["done", "done"]);

  return { id, key };
}

test("a Paste that finds a page with no article text turns a long Article into Other and deletes its file", async () => {
  const bytes = Buffer.from(longText());
  const { id, key } = await refreshedBy("https://example.com/", "Seeded long Article", bytes);

  expect(await itemOf(owner, id)).toMatchObject({
    source: "other",
    kind: "link",
    status: "ready",
    fetch: "ok",
    postText: null,
  });
  expect(postTextOf(instance, id)).toEqual({ key: null, inline: null });
  await expect.poll(() => instance.listFiles(`items/${id}/`)).toEqual([]);
  expect(instance.readFile(key)).toBeNull();
});

test("a Paste that finds a short article keeps its text in the row, clears the key and deletes the file", async () => {
  const bytes = Buffer.from(longText());
  const { id } = await refreshedBy(ESSAY, "Seeded long Article", bytes);
  const item = await itemOf(owner, id);

  expect(item).toMatchObject({ source: "article", kind: "article", status: "ready", fetch: "ok" });
  expect(item.postText).toContain(ESSAY_SENTENCE);
  expect(postTextOf(instance, id)).toEqual({ key: null, inline: item.postText });
  await expect.poll(() => instance.listFiles(`items/${id}/`)).toEqual([]);
});

test("a refresh that fails leaves the long Article's file and text readable", async () => {
  const bytes = Buffer.from(longText());
  const run = Date.now().toString(36);

  const { id, key } = await refreshedBy(
    `https://example.com/missing-${run}`,
    "Seeded long Article",
    bytes,
  );

  expect(await itemOf(owner, id)).toMatchObject({ status: "ready", fetch: "status" });
  expect(postTextOf(instance, id)).toEqual({ key, inline: null });
  expect(instance.listFiles(`items/${id}/`).map((file) => file.key)).toEqual([key]);

  const text = Buffer.from((await itemOf(owner, id)).postText ?? "");

  expect(text.length).toBe(bytes.length);
  expect(digestOf(text)).toBe(digestOf(bytes));
});
