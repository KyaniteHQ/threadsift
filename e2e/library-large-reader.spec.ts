import { expect, test } from "@playwright/test";
import { z } from "zod";

import { itemPath } from "../src/core/item-path.ts";
import { NEXT_ITEM, PREVIOUS_ITEM } from "../web/src/reader-text.ts";
import { LOAD_FAILED } from "../web/src/text.ts";
import { link } from "./grid.ts";
import { PAGE_SIZE, isCursorRead, largeLibrary, openLibrary } from "./library-large.ts";
import { DESKTOP, afterTwoFrames, storeSettings } from "./look.ts";
import { reader, row } from "./reader.ts";

const library = largeLibrary();

function openAt(id: number): RegExp {
  return new RegExp(`/items/${id}$`, "u");
}

test("j carries the Reader across the page edge and k carries it back", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const last = order[PAGE_SIZE - 1] ?? 0;
  const afterLast = order[PAGE_SIZE] ?? 0;
  const beyondLast = order[PAGE_SIZE + 1] ?? 0;

  const gate = Promise.withResolvers<void>();

  await page.route(isCursorRead, async (route) => {
    await gate.promise;
    await route.continue();
  });

  await openLibrary(page, "list", itemPath(last));
  await expect(reader(page)).toBeVisible();
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);

  await page.keyboard.press("j");
  gate.resolve();
  await expect(page).toHaveURL(openAt(afterLast));
  await expect(row(page, afterLast)).toHaveClass(/\bopen\b/u);
  await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);

  await page.keyboard.press("k");
  await expect(page).toHaveURL(openAt(last));

  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(page).toHaveURL(openAt(beyondLast));
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("in the Grid sheet Next and Previous carry the Reader across the page edge, and j moves focus across it when nothing is open", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const last = order[PAGE_SIZE - 1] ?? 0;
  const afterLast = order[PAGE_SIZE] ?? 0;

  await page.setViewportSize(DESKTOP);
  await storeSettings(page, { layout: "grid", openAs: "sheet" }, itemPath(last));
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
  await expect(page.getByRole("button", { name: NEXT_ITEM })).toBeEnabled();

  await page.getByRole("button", { name: NEXT_ITEM }).click();
  await expect(page).toHaveURL(openAt(afterLast));
  await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);

  await page.getByRole("button", { name: PREVIOUS_ITEM }).click();
  await expect(page).toHaveURL(openAt(last));

  await storeSettings(page, { layout: "grid", openAs: "page" }, "/");
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
  await link(page, last).focus();
  await page.keyboard.press("j");
  await expect(link(page, afterLast)).toBeFocused();
});

test("an Item far past the first page opens by its address and the list still holds the first page", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const far = order[2500] ?? 0;

  const titles = screen.fresh.query(
    `SELECT title FROM items WHERE id = ${far}`,
    z.array(z.object({ title: z.string() })),
  );

  await openLibrary(page, "list", itemPath(far));
  await expect(reader(page)).toContainText(titles[0]?.title ?? "no title");
  await expect(page).toHaveURL(openAt(far));
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
});

test("a press of k or Escape while the next page is on its way is not undone when the page lands", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const last = order[PAGE_SIZE - 1] ?? 0;
  const gate = Promise.withResolvers<void>();

  await page.route(isCursorRead, async (route) => {
    await gate.promise;
    await route.continue();
  });

  await openLibrary(page, "list", itemPath(last));
  await expect(reader(page)).toBeVisible();

  await page.keyboard.press("j");
  await page.keyboard.press("k");
  await expect(page).toHaveURL(openAt(order[PAGE_SIZE - 2] ?? 0));
  gate.resolve();
  await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);
  await afterTwoFrames(page);
  await expect(page).toHaveURL(openAt(order[PAGE_SIZE - 2] ?? 0));
  await page.unrouteAll({ behavior: "ignoreErrors" });

  const slow = Promise.withResolvers<void>();

  await page.route(isCursorRead, async (route) => {
    await slow.promise;
    await route.continue();
  });

  await page.goto(itemPath(last));
  await expect(reader(page)).toBeVisible();

  await page.keyboard.press("j");
  await page.keyboard.press("Escape");
  await expect(reader(page)).toBeHidden();
  slow.resolve();
  await expect(page.locator("article.it")).toHaveCount(2 * PAGE_SIZE);
  await afterTwoFrames(page);
  await expect(reader(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/u);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("a failed page read at the edge of the Grid sheet is announced inside the sheet, and Next reads the page again", async () => {
  const { screen, order } = library();
  const { page } = screen;
  const last = order[PAGE_SIZE - 1] ?? 0;
  const afterLast = order[PAGE_SIZE] ?? 0;

  await page.route(isCursorRead, (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.setViewportSize(DESKTOP);
  await storeSettings(page, { layout: "grid", openAs: "sheet" }, itemPath(last));
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);

  await page.getByRole("button", { name: NEXT_ITEM }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(LOAD_FAILED);
  await expect(page).toHaveURL(openAt(last));

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.getByRole("button", { name: NEXT_ITEM }).click();
  await expect(page).toHaveURL(openAt(afterLast));
});
