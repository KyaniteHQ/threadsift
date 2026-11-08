import { expect, test } from "@playwright/test";

import { DELETED } from "../web/src/reader-text.ts";
import { newCode, newPassword } from "./access.ts";
import {
  WIDE,
  askAndConfirm,
  dialog,
  holdDelete,
  openItemAt,
  seedWeather,
  titleLink,
} from "./deletion-ui.ts";
import { choice, expectRows, holdRead } from "./filters.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { deferJobs } from "./ingest.ts";
import { addButton, pasteCard, pasteField } from "./links.ts";
import { afterTwoFrames } from "./look.ts";
import { openRow, row } from "./reader.ts";

test.describe.configure({ timeout: 120_000 });

test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

let screen: FreshScreen;
let ids: readonly number[];

test.beforeEach(async ({ browser }) => {
  screen = await openSignedIn(browser, newCode(), newPassword());
  ids = seedWeather(screen);
});

test.afterEach(async () => {
  await screen.close();
});

test("a list answer that lands while the delete is pending sends focus to the next row of that list", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0, fourth = 0] = ids;
  await openItemAt(page, WIDE, second, 4);

  const filtered = await holdRead(page, (url) => url.searchParams.get("read") === "unread");
  await choice(page, "Read state", "Unread").click();
  await filtered.reached;

  const held = await holdDelete(page);
  await askAndConfirm(page);
  await held.reached;

  filtered.release();
  await filtered.delivered;
  await expect(row(page, third)).toHaveCount(0);

  held.release();
  await expect(row(page, second)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  await expectRows(page, [first, fourth]);
  await expect(titleLink(page, fourth)).toBeFocused();
});

test("two deletes in a row each change the live region, and its element stays mounted", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0] = ids;
  await openItemAt(page, WIDE, first, 4);

  const region = page.locator(".lib > output");
  const element = await region.elementHandle();

  const texts = await region.evaluateHandle((output) => {
    const seen: string[] = [];

    new MutationObserver(() => {
      seen.push(output.textContent ?? "");
    }).observe(output, { childList: true, characterData: true, subtree: true });

    return seen;
  });

  await askAndConfirm(page);
  await expect(row(page, first)).toHaveCount(0);
  await expect(region).toHaveText(DELETED);

  await openRow(page, second);
  await askAndConfirm(page);
  await expect(row(page, second)).toHaveCount(0);
  await expect(region).toHaveText(DELETED);
  await expect(titleLink(page, third)).toBeFocused();

  expect(await texts.jsonValue(), "the live region's text, change by change").toEqual([
    DELETED,
    "",
    DELETED,
  ]);

  expect(await element?.evaluate((output) => output.isConnected)).toBe(true);
});

test("a Paste answer that arrives after the Item was deleted leaves focus where the delete put it and shows no card", async () => {
  const { page } = screen;
  const [first = 0, second = 0, third = 0, fourth = 0] = ids;
  await openItemAt(page, WIDE, first, 4);
  const releaseFetch = deferJobs(screen.fresh, "fetch");

  const gate = Promise.withResolvers<void>();
  const reached = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();

  await page.route(/\/api\/items$/u, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();

      return;
    }

    const response = await route.fetch();
    reached.resolve();
    await gate.promise;
    await route.fulfill({ response });
    delivered.resolve();
  });

  await pasteField(page).fill("https://example.com/one");
  await addButton(page).click();
  await reached.promise;
  await askAndConfirm(page);
  await expect(row(page, first)).toHaveCount(0);
  await expect(titleLink(page, second)).toBeFocused();

  gate.resolve();
  await delivered.promise;
  await afterTwoFrames(page);

  await expectRows(page, [second, third, fourth]);
  await expect(titleLink(page, second)).toBeFocused();
  await expect(pasteCard(page)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: DELETED })).toBeAttached();
  releaseFetch();
});
