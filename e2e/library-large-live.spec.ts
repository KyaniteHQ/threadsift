import { expect, test } from "@playwright/test";
import { z } from "zod";

import { ask, confirmButton } from "./deletion-ui.ts";
import { choice, rowsInOrder } from "./filters.ts";
import {
  PAGE_SIZE,
  idsWhere,
  largeLibrary,
  openLibrary,
  results,
  scrollUntil,
} from "./library-large.ts";
import { pasteField } from "./links.ts";
import { afterTwoFrames } from "./look.ts";
import { row } from "./reader.ts";

const library = largeLibrary();

test("a Read state change, a delete and a Paste deep in a loaded list change the rows and the counts without a reload, and keep the rows already loaded", async () => {
  const { screen } = library();
  const { page } = screen;
  await openLibrary(page, "list");

  await page.evaluate(() => {
    document.documentElement.dataset["kept"] = "yes";
  });

  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);
  await scrollUntil(page, 3 * PAGE_SIZE);

  const loaded = await rowsInOrder(page);
  const unread = new Set(idsWhere(screen, "read_state = 'unread'"));
  const [marked = 0, doomed = 0] = loaded.slice(2 * PAGE_SIZE).filter((id) => unread.has(id));

  await row(page, marked).locator("a.it-open").focus();
  await page.keyboard.press("m");
  await expect(results(page)).toHaveText("3000 items, 2249 unread");
  await expect(choice(page, "Read state", "Read")).toContainText("751");

  await row(page, doomed).locator("a.it-open").click();
  await ask(page);
  await confirmButton(page).click();
  await expect(row(page, doomed)).toHaveCount(0);
  await expect(results(page)).toHaveText("2999 items, 2248 unread");

  await pasteField(page).fill(`https://example.com/large-library-paste-${Date.now()}`);
  await pasteField(page).press("Enter");
  await expect(results(page)).toHaveText("3000 items, 2249 unread");

  const after = await rowsInOrder(page);
  expect(after.slice(1, loaded.length)).toEqual(loaded.filter((id) => id !== doomed));
  expect(await page.evaluate(() => document.documentElement.dataset["kept"])).toBe("yes");
});

test("a Paste of a link the library already holds, whose row is not loaded, changes no count and adds no row", async () => {
  const { screen, order } = library();
  const { page } = screen;
  await openLibrary(page, "list");
  await expect(page.locator("article.it")).toHaveCount(PAGE_SIZE);

  const before = await rowsInOrder(page);
  const head = await results(page).innerText();

  const stored = screen.fresh.query(
    `SELECT normalized_url AS url FROM items WHERE id = ${order[2800]}`,
    z.array(z.object({ url: z.string() })),
  );

  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/items" && response.request().method() === "POST",
  );

  await pasteField(page).fill(stored[0]?.url ?? "");
  await pasteField(page).press("Enter");
  expect((await saved).status()).toBe(200);
  await afterTwoFrames(page);

  await expect(results(page)).toHaveText(head);
  expect(await rowsInOrder(page)).toEqual(before);
});
