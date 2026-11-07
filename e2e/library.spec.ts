import { type Page, expect, test } from "@playwright/test";

import type { Item } from "../src/http/schemas.ts";
import { mainInstance } from "./access.ts";
import { listAll, settled } from "./api.ts";
import { livePasted } from "./articles.ts";
import {
  MOVED_PAGE,
  MOVED_PAGE_NORMALIZED,
  MOVED_PAGE_TITLE,
  SHORT_LINK,
  SHORT_LINK_TARGET,
  SHORT_LINK_TARGET_NORMALIZED,
  X_POST,
  newRunId,
  pasteLink,
  rowOf,
  throughRedirects,
} from "./links.ts";
import { type Listener, startListener } from "./listener.ts";
import { POST_TITLE, POST_URL } from "./reddit.ts";

const REDDIT_FIELDS = { source: "reddit", title: POST_TITLE, author: "tamale_uk" } as const;

let listener: Listener;

test.beforeAll(async () => {
  listener = await startListener();
});

test.afterAll(async () => {
  await listener.stop();
});

const REDDIT_POST =
  "https://www.reddit.com/r/typescript/comments/2a4qo6/wallabag_a_read_it_later_app_similar_like/";

const REDDIT_COMMENT = "https://www.reddit.com/r/selfhosted/comments/2a4qo6/wallabag/cisdfvv/";
const EXAMPLE = "https://example.com/";

const FETCHED_TITLES: ReadonlyMap<
  string,
  Readonly<{ name: string; normalizedUrl: string }>
> = new Map([
  [REDDIT_POST, { name: "reddit-post", normalizedUrl: POST_URL }],
  [REDDIT_COMMENT, { name: "reddit-comment", normalizedUrl: `${POST_URL}_/cisdfvv/` }],
  [EXAMPLE, { name: "example", normalizedUrl: EXAMPLE }],
  [MOVED_PAGE, { name: "moved-page", normalizedUrl: MOVED_PAGE_NORMALIZED }],
  [SHORT_LINK_TARGET, { name: "short-link-target", normalizedUrl: SHORT_LINK_TARGET_NORMALIZED }],
]);

function pastedLinks(redirect: string): string[] {
  return [
    REDDIT_POST,
    "https://old.reddit.com/r/selfhosted/comments/2a4qo6/other_slug/",
    REDDIT_COMMENT,
    EXAMPLE,
    MOVED_PAGE,
    SHORT_LINK,
    SHORT_LINK_TARGET,
    X_POST,
    redirect,
  ];
}

function expectedItems(redirect: string) {
  return new Map<string, Partial<Item>>([
    [POST_URL, { ...REDDIT_FIELDS, community: "selfhosted" }],
    [`${POST_URL}_/cisdfvv/`, { ...REDDIT_FIELDS, community: "selfhosted" }],
    [EXAMPLE, { source: "other", title: "Example Domain" }],
    [MOVED_PAGE_NORMALIZED, { title: MOVED_PAGE_TITLE }],
    [SHORT_LINK_TARGET_NORMALIZED, { source: "article", title: "Example Domains" }],
    [X_POST, { source: "x", title: null }],
    [redirect, { source: "other", title: null }],
  ]);
}

async function libraryItems(page: Page, redirect: string) {
  const expected = expectedItems(redirect);
  const stored = await listAll(page.request);
  expect(stored.filter((item) => item.normalizedUrl === SHORT_LINK)).toEqual([]);
  const items = stored.filter((item) => expected.has(item.normalizedUrl));

  expect(items.map((item) => item.normalizedUrl).toSorted()).toEqual(
    [...expected.keys()].toSorted(),
  );

  for (const item of items) {
    expect(item).toMatchObject(expected.get(item.normalizedUrl) ?? {});
  }

  return items;
}

async function expectRowsShowTitles(page: Page, redirect: string) {
  for (const item of await libraryItems(page, redirect)) {
    const link = rowOf(page, item.id).locator(".it-open");
    await expect(link).toBeVisible();

    if (item.title !== null) {
      await expect(link).toContainText(item.title.slice(0, 20));
    }
  }
}

function pasteLinkUntilFetched(
  page: Page,
  url: string,
  { name, normalizedUrl }: Readonly<{ name: string; normalizedUrl: string }>,
) {
  return livePasted(
    `library-${name}`,
    async () => {
      await pasteLink(page, url);

      const stored = (await listAll(page.request)).find(
        (item) => item.normalizedUrl === normalizedUrl,
      );

      if (stored === undefined) {
        throw new Error(`no Item at ${normalizedUrl} after pasting ${url}`);
      }

      return settled(page.request, stored.id);
    },
    (item) => item.fetch,
  );
}

test("nine pasted links make seven Items with their titles, and the library keeps them across a restart", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const redirect = `${throughRedirects(`http://127.0.0.1:${listener.port}/`, 1)}&run=${newRunId()}`;
  await page.goto("/");

  for (const url of pastedLinks(redirect)) {
    const fetchedTitle = FETCHED_TITLES.get(url);

    if (fetchedTitle === undefined) {
      await pasteLink(page, url);
    } else {
      await pasteLinkUntilFetched(page, url, fetchedTitle);
    }
  }

  await expectRowsShowTitles(page, redirect);
  await listener.expectSilent();

  const before = await libraryItems(page, redirect);
  mainInstance().restart();
  expect(await libraryItems(page, redirect)).toEqual(before);

  await page.goto("/");
  await pasteLink(page, "https://m.reddit.com/r/selfhosted/comments/2a4qo6/");

  const post = before.find((item) => item.normalizedUrl === POST_URL);
  const after = (await listAll(page.request)).find((item) => item.normalizedUrl === POST_URL);
  expect(after?.id).toBe(post?.id);
  expect(after?.savedAt).toBe(post?.savedAt);
  expect(after?.fetchedAt).toBeGreaterThan(post?.fetchedAt ?? Number.POSITIVE_INFINITY);
  expect(after?.title).toBe(POST_TITLE);
});
