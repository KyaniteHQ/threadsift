import { expect, test } from "@playwright/test";

import { RETRY_LABEL } from "../web/src/text.ts";
import {
  ADDED,
  READING,
  SLOW_PAGE,
  UNREACHABLE,
  unreachableUrl,
  cardTitle,
  countListReads,
  pasteForId,
  pasteOnly,
  seed,
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
  await expect(rowOf(page, id).locator(".skel")).toBeVisible();
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
  await expect(rowOf(page, id).locator(".skel")).toBeVisible();
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
  await expect(row.locator(".skel")).toBeVisible();
  await expect(row.locator(".it-fail")).toContainText(UNREACHABLE, { timeout: 30_000 });
  reads.expectNoNewReads();
});
