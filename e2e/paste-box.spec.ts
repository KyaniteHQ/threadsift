import { type Page, expect, test } from "@playwright/test";

import { listAll, postLink } from "./api.ts";
import { newRunId } from "./links.ts";

function rowCount(page: Page): Promise<number> {
  return page.locator("article.it").count();
}

test("Add with an empty box or text that is not a link shows a refusal and saves nothing", async ({
  page,
  request,
}) => {
  await postLink(request, `https://example.com/${newRunId()}/seed`);
  await page.goto("/");
  await expect(page.locator("article.it").first()).toBeVisible();
  const rows = await rowCount(page);
  const stored = (await listAll(request)).length;

  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toContainText("Paste a link first.");

  await page.getByRole("textbox", { name: "Paste a link to save" }).fill("not a url");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toContainText("That doesn't look like a link.");

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

test("Add gives the field focus, ties a refusal to it, and Dismiss clears the refusal", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });

  await page.getByRole("button", { name: "Add" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Paste a link first.");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", (await alert.getAttribute("id")) ?? "");

  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).not.toHaveAttribute("aria-invalid", /./u);

  await field.fill("not a url");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(alert).toBeVisible();
  await expect(field).toBeFocused();
});

test("a saved link returns focus to the field and the list shows it at the top", async ({
  page,
  request,
}) => {
  const run = newRunId();

  for (let index = 0; index < 30; index += 1) {
    await postLink(request, `https://example.com/${run}/earlier-${index}`);
  }

  await page.goto("/");
  const list = page.locator(".list");
  await expect(page.locator("article.it").nth(29)).toBeVisible();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill(`https://example.com/${run}/newest`);
  await page.getByRole("button", { name: "Add" }).click();

  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(page.locator("article.it").first().locator(".it-open")).toContainText(
    `${run}/newest`,
  );
  expect(await list.evaluate((element) => element.scrollTop)).toBe(0);
});
