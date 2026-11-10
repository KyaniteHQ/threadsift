import { type Page, expect, test } from "@playwright/test";

import { COMMENTS_TITLE, READER_FAILED } from "../web/src/reader-text.ts";
import { RETRY_LABEL, SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import { comments, expectJumpedToComments } from "./comment-reader.ts";
import { type Seeded, seedThreads } from "./comment-thread.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, viewportAt } from "./look.ts";
import { bar, reader } from "./reader.ts";

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

const POST_TEXT_CHUNK = "**/assets/PostText-*.js";

let screen: FreshScreen;
let ids: Seeded;

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = await seedThreads(screen);
});

test.afterAll(async () => {
  await screen.close();
});

async function holdPostText(page: Page): Promise<{ release: () => void }> {
  const gate = Promise.withResolvers<void>();

  await page.route(POST_TEXT_CHUNK, async (route) => {
    await gate.promise;
    await route.continue();
  });

  return { release: gate.resolve };
}

test("a press of Comments while the Reader body is still loading takes the reader to the section once it renders", async () => {
  const { page } = screen;

  await viewportAt(page, DESKTOP.width);
  const gate = await holdPostText(page);

  try {
    await page.goto(`/items/${ids.thread}`);
    await expect(reader(page).locator(".rd-loading")).toBeVisible();
    await expect(comments(page)).toHaveCount(0);

    await bar(page).locator(".rd-cm").click();
    gate.release();

    await expect(comments(page)).toBeVisible();
    await expectJumpedToComments(page);
  } finally {
    gate.release();
    await page.unroute(POST_TEXT_CHUNK);
  }
});

test("a pending jump to Comments is dropped when the owner moved focus to the search box before the section rendered", async () => {
  const { page } = screen;
  const search = page.getByRole("searchbox", { name: SEARCH_LABEL });

  await viewportAt(page, DESKTOP.width);
  const gate = await holdPostText(page);

  try {
    await page.goto(`/items/${ids.thread}`);
    await expect(reader(page).locator(".rd-loading")).toBeVisible();

    await bar(page).locator(".rd-cm").click();
    await search.focus();
    gate.release();

    const heading = comments(page).getByRole("heading", { name: COMMENTS_TITLE });
    await expect(heading).toBeVisible();
    await expect(search).toBeFocused();
    await expect(heading).not.toBeFocused();
  } finally {
    gate.release();
    await page.unroute(POST_TEXT_CHUNK);
  }
});

test("a press of Comments while the Reader failed to load does nothing, and Try again later does not jump", async () => {
  const { page } = screen;
  const detail = `**/api/items/${ids.thread}`;
  let failed = false;

  await viewportAt(page, DESKTOP.width);
  await page.route(detail, async (route) => {
    if (failed) await route.fallback();
    else {
      failed = true;
      await route.abort("failed");
    }
  });

  try {
    await page.goto(`/items/${ids.thread}`);
    await expect(page.getByText(READER_FAILED)).toBeVisible();

    await bar(page).locator(".rd-cm").click();
    await page.getByRole("button", { name: RETRY_LABEL, exact: true }).click();

    const heading = comments(page).getByRole("heading", { name: COMMENTS_TITLE });
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeFocused();
  } finally {
    await page.unroute(detail);
  }
});
