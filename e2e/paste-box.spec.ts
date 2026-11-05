import { type APIRequestContext, type Page, expect, test } from "@playwright/test";

import { SAVING_STATUS } from "../web/src/text.ts";
import { listAll, postLink } from "./api.ts";
import { alertRegion } from "./card.ts";
import { addButton, newRunId, pasteCard, pasteField, rowOf, submitLink } from "./links.ts";

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

  await addButton(page).click();
  await expect(pasteCard(page)).toContainText("Paste a link first.");
  await expect(alertRegion(page)).toContainText("Paste a link first.");

  await submitLink(page, "not a url");
  await expect(pasteCard(page)).toContainText("That doesn’t look like a link.");
  await expect(pasteCard(page).locator(".ps-url")).toHaveCount(0);

  await submitLink(page, "example.com/bare-domain");
  await expect(pasteCard(page)).toContainText("Links must start with https:// or http://.");

  expect(await rowCount(page)).toBe(rows);
  expect(await listAll(request)).toHaveLength(stored);
});

test("Add on an empty box never shows the saving state", async ({ page }) => {
  await page.goto("/");

  const changes = await page.evaluateHandle(() => {
    const seen: string[] = [];

    new MutationObserver((records) => {
      for (const record of records) {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        seen.push(
          `${record.attributeName ?? record.type}:${record.oldValue ?? ""}`,
          ...nodes.map((node) => node.textContent ?? ""),
        );
      }
    }).observe(document.querySelector(".paste") ?? document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
    });

    return seen;
  });

  await addButton(page).click();
  await expect(pasteCard(page)).toContainText("Paste a link first.");

  const sawSaving = await changes.evaluate(
    (seen, status) =>
      seen.some((change) => change.includes(status) || change === "aria-disabled:true"),
    SAVING_STATUS,
  );

  expect(sawSaving, "the paste box showed the saving state for an empty Add").toBe(false);
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
  const row = rowOf(page, item.id);
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
  const field = pasteField(page);

  await addButton(page).click();
  const card = pasteCard(page);
  await expect(card).toContainText("Paste a link first.");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", (await card.getAttribute("id")) ?? "");

  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).not.toHaveAttribute("aria-invalid", /./u);

  await submitLink(page, "not a url");
  await expect(card).toBeVisible();
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

  const field = pasteField(page);
  await submitLink(page, `https://example.com/${run}/newest`);

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
  const field = pasteField(page);
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

async function pasteKnownLinkBelowTheFold(
  page: Page,
  request: APIRequestContext,
  link: string,
): Promise<void> {
  const run = newRunId();
  await postLink(request, link);

  for (let index = 0; index < 30; index += 1) {
    await postLink(request, `https://example.com/${run}/newer-${index}`);
  }

  await page.goto("/");
  await expect(page.locator("article.it").nth(30)).toBeVisible();
  await submitLink(page, link);
  await expect(pasteField(page)).toHaveValue("");
}

test("pasting a known link that shows a note keeps focus in the field", async ({
  page,
  request,
}) => {
  const link = `https://example.com/missing-${newRunId()}`;
  await pasteKnownLinkBelowTheFold(page, request, link);

  await expect(pasteField(page)).toBeFocused();
  await expect(pasteCard(page)).toContainText("answered with an error", { timeout: 20_000 });
  await expect(pasteField(page)).toBeFocused();
});

test("an Item URL that matches no Item opens the plain list at /", async ({ page, request }) => {
  await postLink(request, `https://example.com/${newRunId()}/exists`);
  await page.goto("/items/999999999");
  await expect(page.locator("article.it").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("article.it.open")).toHaveCount(0);
});
