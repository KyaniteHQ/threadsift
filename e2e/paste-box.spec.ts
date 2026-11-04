import { type Page, expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId } from "./links.ts";

function rowCount(page: Page): Promise<number> {
  return page.locator(".it").count();
}

test("Add with an empty box or text that is not a link shows a refusal and saves nothing", async ({
  page,
  request,
}) => {
  await postLink(request, `https://example.com/${newRunId()}/seed`);
  await page.goto("/");
  await expect(page.locator(".it").first()).toBeVisible();
  const rows = await rowCount(page);
  const stored = (await listAll(request)).length;

  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toHaveText("Paste a link first.");

  await page.getByRole("textbox", { name: "Paste a link to save" }).fill("not a url");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toHaveText("That doesn't look like a link.");

  expect(await rowCount(page)).toBe(rows);
  expect(await listAll(request)).toHaveLength(stored);
});

test("an Item's own URL shows the list with that row in view and focused", async ({
  page,
  request,
}) => {
  const run = newRunId();
  const saved = [];

  for (let index = 0; index < 40; index += 1) {
    saved.push(await postLink(request, `https://example.com/${run}/entry-${index}`));
  }

  const oldest = saved[0];
  expect(oldest).toBeDefined();
  const { item, url } = oldest?.body ?? { item: { id: 0 }, url: "" };

  await page.goto(url);
  const row = page.locator(`.it[data-key="${item.id}"]`);
  await expect(row.locator(".it-open")).toBeFocused();
  await expect(row).toHaveClass(/\bopen\b/u);
  await expect
    .poll(() =>
      row.evaluate((element) => {
        const pane = element.closest(".list, .lib");
        const box = element.getBoundingClientRect();
        const paneBox = pane?.getBoundingClientRect();

        return paneBox !== undefined && box.top >= paneBox.top && box.bottom <= paneBox.bottom;
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop)).toBe(0);

  await page.goto("/api/items");
  expect(await page.evaluate(() => document.contentType)).toBe("application/json");
});
