import { type Page, expect, test } from "@playwright/test";

import { CLEAR_ALL, SEARCH_LABEL } from "../web/src/text.ts";
import { newCode, newPassword } from "./access.ts";
import {
  type Library,
  buildLibrary,
  choice,
  expectRows,
  group,
  head,
  holdRead,
  watchList,
} from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, afterTwoFrames } from "./look.ts";

let screen: FreshScreen;
let page: Page;
let library: Library;

test.describe.configure({ mode: "serial", timeout: 480_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

test.beforeAll(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  library = await buildLibrary(screen);
});

test.afterAll(async () => {
  await screen.close();
});

test.beforeEach(async () => {
  page = await screen.context.newPage();
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  await expectRows(page, library.everyone);
});

test.afterEach(async () => {
  await page.close();
});

test("an older answer that arrives after a newer search never replaces it", async () => {
  const field = page.getByRole("searchbox", { name: SEARCH_LABEL });
  const seen = await watchList(page);
  const older = await holdRead(page, (url) => url.searchParams.get("q") === "essay");

  await field.fill("essay");
  await older.reached;
  await field.fill("linkonly");
  const linkOnly = Object.values(library.linkOnly);
  await expectRows(page, linkOnly);
  await expect(head(page)).toHaveText("4 of 11 items matching “linkonly”");

  older.release();
  await older.delivered;
  await afterTwoFrames(page);

  await expectRows(page, linkOnly);
  await expect(head(page)).toHaveText("4 of 11 items matching “linkonly”");
  expect(seen().filter(({ rows }) => rows === library.articles.length)).toEqual([]);
});

test("an older answer that arrives after Clear filters never brings the filter back", async () => {
  const seen = await watchList(page);
  const older = await holdRead(page, (url) => url.searchParams.has("topic"));

  await choice(page, "Topic", "Reading").click();
  await older.reached;

  const newer = page.waitForResponse((response) => {
    const { pathname, search } = new URL(response.url());

    return pathname === "/api/items" && search === "";
  });

  await page.getByRole("button", { name: "Clear filters" }).click();
  await (await newer).finished();
  await afterTwoFrames(page);
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);

  older.release();
  await older.delivered;
  await afterTwoFrames(page);

  await expectRows(page, library.everyone);
  await expect(choice(page, "Topic", "Reading")).toHaveAttribute("aria-pressed", "false");
  await expect(head(page)).toHaveText("11 items, 8 unread");
  expect(seen().filter(({ rows }) => rows === 2)).toEqual([]);
});

test("a search with no match says so and one button clears the search and every filter", async () => {
  const field = page.getByRole("searchbox", { name: SEARCH_LABEL });

  await choice(page, "Source", "Article").click();
  await field.fill("qzxjwv");
  await expect(page.getByText("No items match")).toBeVisible();
  await expect(head(page)).toHaveText("0 of 11 items matching “qzxjwv”");
  await expectRows(page, []);

  await page.getByRole("button", { name: CLEAR_ALL }).click();
  await expectRows(page, library.everyone);
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(choice(page, "Source", "Article")).toHaveAttribute("aria-pressed", "false");
  await expect(head(page)).toHaveText("11 items, 8 unread");
});

test("an open Item that the filters hide stays open in the address and returns with them cleared", async () => {
  const open = library.articles[4] ?? 0;

  await page.goto(`/items/${open}`);
  await expect(page.locator(`.it[data-key="${open}"]`)).toHaveClass(/\bopen\b/u);

  await choice(page, "Topic", "Reading").click();
  await expectRows(page, library.articles.slice(0, 2));
  await expect(page).toHaveURL(new RegExp(`/items/${open}$`, "u"));

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expectRows(page, library.everyone);
  await expect(page.locator(`.it[data-key="${open}"]`)).toHaveClass(/\bopen\b/u);
  await expect(group(page, "Topic")).toBeVisible();
});
