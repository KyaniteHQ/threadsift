import { expect, test } from "@playwright/test";

import { RETRY_LABEL } from "../web/src/text.ts";
import {
  ADDED,
  READING,
  SLOW_PAGE,
  UNREACHABLE,
  alertRegion,
  unreachableUrl,
  cardTitle,
  countListReads,
  pasteForId,
  pasteOnly,
  seed,
  watchAnnouncements,
} from "./card.ts";
import { newRunId, pasteCard, rowOf } from "./links.ts";

test("a processing row updates in place after Escape dismissed its card", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=escape`);
  await expect(cardTitle(page)).toHaveText(READING);
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a processing row updates in place after a newer Paste replaced its card", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=newer`);
  await pasteOnly(page, `https://example.com/${run}/newer`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a processing row found at page load updates in place", async ({ page, request }) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=reload`);
  await page.reload();
  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();
  const reads = countListReads(page);

  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a failed row has Try again that sets it processing and ends failed again, without a list reload", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, unreachableUrl(run));
  await expect(cardTitle(page)).toHaveText(READING);
  await page.keyboard.press("Escape");
  const row = rowOf(page, id);
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });

  await row.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(row.locator(".skel i")).toBeVisible();
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("a row's Try again is a Paste: the card shows, both live regions follow it, and the button is described by the row's name", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, unreachableUrl(run));
  await page.keyboard.press("Escape");
  const row = rowOf(page, id);
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });

  const name = `no-such-host-${run}.invalid`;
  const retry = row.getByRole("button", { name: RETRY_LABEL });
  await expect(retry).toHaveAccessibleDescription(new RegExp(name, "u"));

  const trace = await watchAnnouncements(page);
  await retry.click();

  await expect(cardTitle(page)).toHaveText(READING);
  await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
  await expect(alertRegion(page)).toHaveText(`${UNREACHABLE}: ${name}`);

  const seen = await trace();
  expect(seen.polite.some((text) => text.startsWith(`${READING}: ${name}`))).toBe(true);
  expect(seen.alert).toContain(`${UNREACHABLE}: ${name}`);
});

test("a hidden tab stops reading a processing Item and reads once when it is visible again", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}&via=hidden`);
  await expect(cardTitle(page)).toHaveText(READING);

  let itemReads = 0;

  page.on("request", (sent) => {
    if (new URL(sent.url()).pathname === `/api/items/${id}`) {
      itemReads += 1;
    }
  });

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  });
  await page.waitForTimeout(5000);
  expect(itemReads, "reads while the tab was hidden").toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0, { timeout: 10_000 });
  expect(itemReads, "reads after the tab was visible again").toBeGreaterThanOrEqual(1);
});
