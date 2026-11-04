import { setTimeout as sleep } from "node:timers/promises";

import { type Page, expect, test } from "@playwright/test";

import type { Item } from "../src/http/schemas.ts";
import { listAll, refusedWith } from "./api.ts";
import { newRunId, pasteLink } from "./links.ts";
import { type Listener, startListener } from "./listener.ts";
import { restartTarget } from "./target.ts";

const POST = "https://reddit.com/r/all/comments/2a4qo6/";
const POST_TITLE = "Wallabag - A 'read it later' app similar like Instapaper or Pocket";
const REDDIT_FIELDS = { source: "reddit", title: POST_TITLE, author: "tamale_uk" } as const;
const SHORT_LINK = "https://is.gd/hK2a1W";
const SHORT_LINK_TARGET = "https://www.iana.org/help/example-domains";
const SHORT_LINK_TARGET_NORMALIZED = "https://iana.org/help/example-domains";
const X_POST = "https://x.com/jack/status/20";
const RENAMED_REPOSITORY = "https://github.com/KyaniteHQ/commonplace";

let listener: Listener;

test.beforeAll(async () => {
  listener = await startListener();
});

test.afterAll(async () => {
  await listener.stop();
});

function pastedLinks(redirect: string): string[] {
  return [
    "https://www.reddit.com/r/typescript/comments/2a4qo6/wallabag_a_read_it_later_app_similar_like/",
    "https://old.reddit.com/r/selfhosted/comments/2a4qo6/other_slug/",
    "https://www.reddit.com/r/selfhosted/comments/2a4qo6/wallabag/cisdfvv/",
    "https://example.com/",
    RENAMED_REPOSITORY,
    SHORT_LINK,
    SHORT_LINK_TARGET,
    X_POST,
    redirect,
  ];
}

function expectedItems(redirect: string) {
  return new Map<string, Partial<Item>>([
    [POST, { ...REDDIT_FIELDS, community: "selfhosted" }],
    [`${POST}_/cisdfvv/`, { ...REDDIT_FIELDS, community: "selfhosted" }],
    ["https://example.com/", { source: "other", title: "Example Domain" }],
    [RENAMED_REPOSITORY, { source: "github" }],
    [SHORT_LINK_TARGET_NORMALIZED, { source: "other", title: "Example Domains" }],
    [X_POST, { source: "x", title: null }],
    [redirect, { source: "other", title: null }],
  ]);
}

async function libraryItems(page: Page, redirect: string) {
  const expected = expectedItems(redirect);
  const items = (await listAll(page.request)).filter((item) => expected.has(item.normalizedUrl));

  expect(items.map((item) => item.normalizedUrl).toSorted()).toEqual(
    [...expected.keys()].toSorted(),
  );

  for (const item of items) {
    expect(item).toMatchObject(expected.get(item.normalizedUrl) ?? {});
  }

  expect(items.find((item) => item.normalizedUrl === RENAMED_REPOSITORY)?.title).toContain(
    "KyaniteHQ/threadsift",
  );

  return items;
}

async function expectRowsShowTitles(page: Page, redirect: string) {
  for (const item of await libraryItems(page, redirect)) {
    const link = page.locator(`.it[data-key="${item.id}"] .it-open`);
    await expect(link).toBeVisible();

    if (item.title !== null) {
      await expect(link).toContainText(item.title.slice(0, 20));
    }
  }
}

async function expectRefusalsStoreNothing(page: Page) {
  const total = (await listAll(page.request)).length;
  const { port } = listener;

  const refusals = [
    `http://127.0.0.1:${port}/`,
    `http://localhost.:${port}/`,
    "http://[64:ff9b::7f00:1]/",
    "http://0x7f.1/",
  ];

  for (const url of refusals) {
    expect((await refusedWith(page.request, JSON.stringify({ url }))).status, url).toBe(400);
  }

  expect(await listAll(page.request)).toHaveLength(total);
  expect(listener.seen()).toEqual(listener.controlRequests);
}

test("nine pasted links make seven Items with their titles, and the library keeps them across a restart", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const redirect = `https://httpbin.dev/redirect-to?url=${encodeURIComponent(`http://127.0.0.1:${listener.port}/`)}&run=${newRunId()}`;
  await page.goto("/");

  for (const url of pastedLinks(redirect)) {
    await pasteLink(page, url);
  }

  await expectRowsShowTitles(page, redirect);
  expect(listener.seen()).toEqual(listener.controlRequests);
  await expectRefusalsStoreNothing(page);

  const before = await libraryItems(page, redirect);
  await restartTarget(baseURL ?? "");
  expect(await libraryItems(page, redirect)).toEqual(before);

  await sleep(50);
  await page.goto("/");
  await pasteLink(page, "https://m.reddit.com/r/selfhosted/comments/2a4qo6/");

  const post = before.find((item) => item.normalizedUrl === POST);
  const after = (await listAll(page.request)).find((item) => item.normalizedUrl === POST);
  expect(after?.id).toBe(post?.id);
  expect(after?.savedAt).toBe(post?.savedAt);
  expect(after?.fetchedAt).toBeGreaterThan(post?.fetchedAt ?? Number.POSITIVE_INFINITY);
  expect(after?.title).toBe(POST_TITLE);
});
