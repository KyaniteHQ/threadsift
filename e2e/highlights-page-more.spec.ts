import { expect, test } from "@playwright/test";

import { projectText } from "../src/core/text-projection.ts";
import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { RETRY_LABEL } from "../web/src/text.ts";
import { screenForFile } from "./highlight-screen.ts";
import { keepWords, wordAt } from "./highlights-page-seed.ts";
import {
  entries,
  links,
  moreButton,
  openPage,
  results,
  textsOnPage,
} from "./highlights-page-ui.ts";
import { POST, created, postRevision, putPost, selectorOf } from "./highlights.ts";
import { DESKTOP } from "./look.ts";
import { run } from "./thread-fixtures.ts";

const screenOf = screenForFile(300_000);

function isPage(url: URL): boolean {
  return url.pathname === "/api/highlights";
}

function isNextPage(url: URL): boolean {
  return isPage(url) && url.searchParams.has("cursor");
}

const TOTAL = 60;

const FIRST_PAGE = 50;

test.beforeAll(async () => {
  await keepWords(screenOf(), "mo", TOTAL);
});

function newestWords(count: number, skip = 0): string[] {
  return Array.from({ length: TOTAL }, (_, index) => wordAt(TOTAL - 1 - index)).slice(
    skip,
    skip + count,
  );
}

test("Load more adds the next entries after the first 50 with no repeat and no gap, focuses the first new one, and a Highlight kept between the two reads waits for a reload", async () => {
  const { page, context } = screenOf();
  const { request } = context;
  await openPage(page, DESKTOP.width);
  await expect(entries(page)).toHaveCount(FIRST_PAGE);
  await expect(results(page)).toHaveText("60 highlights and notes");
  expect(await textsOnPage(page)).toEqual(newestWords(FIRST_PAGE));

  const text = `${wordAt(0)} stays, and this later passage is new.`;
  const itemId = await putPost(request, `mn${run}`, text);

  await created(request, itemId, {
    target: POST,
    revision: await postRevision(request, itemId),
    selector: selectorOf(projectText(text), "this later passage"),
  });

  await moreButton(page).click();
  await expect(entries(page)).toHaveCount(TOTAL);
  await expect(links(page).nth(FIRST_PAGE)).toBeFocused();
  await expect(moreButton(page)).toHaveCount(0);
  expect(await textsOnPage(page)).toEqual(newestWords(TOTAL));

  await page.reload();
  await expect(entries(page)).toHaveCount(FIRST_PAGE);
  await expect(results(page)).toHaveText("61 highlights and notes");
  expect((await textsOnPage(page))[0]).toBe("this later passage");
  await expect(moreButton(page)).toBeVisible();
});

test("a failed Load more says so, keeps the entries, and Try again adds the next ones", async () => {
  const { page } = screenOf();
  await openPage(page, DESKTOP.width);
  await expect(entries(page)).toHaveCount(FIRST_PAGE);

  await page.route(isNextPage, (route) => route.abort());

  await moreButton(page).click();
  await expect(page.getByRole("alert")).toContainText(HIGHLIGHTS_PAGE.loadMoreFailed);
  await expect(entries(page)).toHaveCount(FIRST_PAGE);

  await page.unroute(isNextPage);
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(entries(page)).toHaveCount(TOTAL + 1);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the page shows a loading state while the first answer is awaited and a failed state with Try again when it fails", async () => {
  const { page } = screenOf();
  const { promise: held, resolve: release } = Promise.withResolvers<void>();

  await page.route(isPage, async (route) => {
    await held;
    await route.continue();
  });

  await openPage(page, DESKTOP.width);
  await expect(page.getByText(HIGHLIGHTS_PAGE.loading)).toBeAttached();
  await expect(page.locator("main.hp-col")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".it-ghost")).toHaveCount(3);
  release();
  await expect(entries(page)).toHaveCount(FIRST_PAGE);
  await expect(page.locator("main.hp-col")).toHaveAttribute("aria-busy", "false");
  await page.unroute(isPage);

  await page.route(isPage, (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(HIGHLIGHTS_PAGE.loadFailed);
  await expect(entries(page)).toHaveCount(0);

  await page.unroute(isPage);
  await page.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(entries(page)).toHaveCount(FIRST_PAGE);
});
