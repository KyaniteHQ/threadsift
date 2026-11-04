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
  await expect(page.getByRole("alert")).toContainText("That doesn’t look like a link.");

  await page.getByRole("textbox", { name: "Paste a link to save" }).fill("example.com/bare-domain");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toContainText("Links must start with https:// or http://.");

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

for (const width of [390, 1280]) {
  test(`Shift+Tab up the list never leaves a focused row under the list header at ${width}px`, async ({
    page,
    request,
  }) => {
    const run = newRunId();

    for (let index = 0; index < 20; index += 1) {
      await postLink(request, `https://example.com/${run}/walk-${index}`);
    }

    await page.setViewportSize({ width, height: 600 });
    await page.goto("/");
    const links = page.locator("article.it .it-open");
    await expect(links.nth(14)).toBeVisible();
    await links.nth(14).focus();
    await page.keyboard.press("Tab");

    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press("Shift+Tab");
      const focused = page.locator("article.it:has(.it-open:focus)");

      const covered = await page.evaluate(() => {
        const row = document.querySelector("article.it:has(.it-open:focus)");
        const header = document.querySelector(".list-head");

        return row === null || header === null
          ? true
          : row.getBoundingClientRect().top < header.getBoundingClientRect().bottom - 0.5;
      });

      await expect(focused).toHaveCount(1);
      expect(covered, `step ${step}`).toBe(false);
    }
  });
}

test("a finished save leaves a different link typed while it ran", async ({ page }) => {
  const run = newRunId();
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill(`https://example.com/${run}/first`);

  await page.evaluate((second) => {
    document.querySelector<HTMLButtonElement>("button[type=submit]")?.click();
    const input = document.querySelector<HTMLInputElement>("input");
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, second);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  }, `https://example.com/${run}/second`);

  await expect(page.locator("article.it").first().locator(".it-open")).toContainText(
    `${run}/first`,
  );
  await expect(field).toHaveValue(`https://example.com/${run}/second`);
});

test("pasting a known link brings its row into view and focuses it", async ({ page, request }) => {
  const run = newRunId();

  for (let index = 0; index < 30; index += 1) {
    await postLink(request, `https://example.com/${run}/known-${index}`);
  }

  await page.goto("/");
  await expect(page.locator("article.it").nth(29)).toBeVisible();
  const field = page.getByRole("textbox", { name: "Paste a link to save" });
  await field.fill(`https://example.com/${run}/known-3`);
  await page.getByRole("button", { name: "Add" }).click();

  const row = page.locator("article.it", { hasText: `${run}/known-3` });
  await expect(row.locator(".it-open")).toBeFocused();

  const covered = await page.evaluate(() => {
    const top = document
      .querySelector(".it-open:focus")
      ?.closest("article")
      ?.getBoundingClientRect();

    const header = document.querySelector(".list-head")?.getBoundingClientRect();

    return top === undefined || header === undefined || top.top < header.bottom - 0.5;
  });

  expect(covered).toBe(false);
});

test("an Item URL that matches no Item opens the plain list at /", async ({ page, request }) => {
  await postLink(request, `https://example.com/${newRunId()}/exists`);
  await page.goto("/items/999999999");
  await expect(page.locator("article.it").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("article.it.open")).toHaveCount(0);
});
