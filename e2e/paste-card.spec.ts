import { expect, test } from "@playwright/test";

import { DISMISS_LABEL, NOTICES, READING_NOTE, RETRY_LABEL } from "../web/src/text.ts";
import { postLink } from "./api.ts";
import {
  ADDED,
  CLOSE_MS,
  READING,
  REFRESHED,
  SLOW_PAGE,
  TIMED_OUT,
  cardTitle,
  countListReads,
  expectClosesAfterSixSeconds,
  openLibrary,
  pasteForId,
  pasteOnly,
  seed,
  watchCard,
} from "./card.ts";
import { STALLED } from "./ingest.ts";
import { newRunId, openButton, pasteCard, pasteField, rowOf } from "./links.ts";

const HIGHLIGHT_MS = 1800;

test("a slow page shows Reading the link, then Added with its note, and its row leaves the skeleton without a list reload", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  await seed(page, request, run);
  const reads = countListReads(page);
  const trace = await watchCard(page);

  const id = await pasteForId(page, `${SLOW_PAGE}?run=${run}`);

  await expect(cardTitle(page)).toHaveText(READING);
  await expect(pasteCard(page)).toContainText(READING_NOTE);
  await expect(pasteCard(page).getByRole("button")).toHaveCount(0);
  await expect(rowOf(page, id).locator(".skel")).toBeVisible();

  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 30_000 });
  await expect(pasteCard(page)).toContainText(NOTICES["no-title"].text);
  await expect(openButton(page)).toBeVisible();
  await expect(pasteCard(page).getByRole("button", { name: DISMISS_LABEL })).toBeVisible();
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0);

  expect((await trace()).titles).toEqual([READING, ADDED]);
  reads.expectNoNewReads();
});

test("a host that stalls shows a failure with Try again and Dismiss that does not close itself, and Try again runs a new fetch", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await page.clock.install();
  await seed(page, request, run);
  const reads = countListReads(page);

  const id = await pasteForId(page, `${STALLED}?run=${run}`);
  await expect(cardTitle(page)).toHaveText(READING);

  const alert = page.getByRole("alert");
  await expect(alert).toContainText(TIMED_OUT, { timeout: 30_000 });
  await expect(alert.getByRole("button", { name: RETRY_LABEL })).toBeVisible();
  await expect(alert.getByRole("button", { name: DISMISS_LABEL })).toBeVisible();
  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TIMED_OUT);

  await page.clock.fastForward(CLOSE_MS + 1000);
  await expect(alert).toBeVisible();

  await alert.getByRole("button", { name: RETRY_LABEL }).click();
  await expect(cardTitle(page)).toHaveText(READING);
  await expect(rowOf(page, id).locator(".skel")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(TIMED_OUT, { timeout: 30_000 });
  reads.expectNoNewReads();
});

test("Added closes itself after 6 s", async ({ page, request }) => {
  const run = newRunId();
  await seed(page, request, run);

  await pasteOnly(page, `https://example.com/${run}/closes`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  const shown = Date.now();

  await expect(pasteCard(page)).toBeHidden({ timeout: CLOSE_MS + 3000 });
  expect(Date.now() - shown).toBeGreaterThanOrEqual(CLOSE_MS - 700);
});

test("Added stays while the pointer is over it and closes 6 s after the pointer leaves", async ({
  page,
  request,
}) => {
  const run = newRunId();
  await page.clock.install();
  await seed(page, request, run);

  await pasteOnly(page, `https://example.com/${run}/hover`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await pasteCard(page).hover();
  await page.clock.fastForward(CLOSE_MS + 1500);
  await expect(pasteCard(page)).toBeVisible();

  await page.locator("h1").hover();
  await expectClosesAfterSixSeconds(page);
});

test("Added stays while focus is inside it and closes 6 s after focus leaves", async ({
  page,
  request,
}) => {
  const run = newRunId();
  await page.clock.install();
  await seed(page, request, run);

  await pasteOnly(page, `https://example.com/${run}/focus`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await openButton(page).focus();
  await page.clock.fastForward(CLOSE_MS + 1500);
  await expect(pasteCard(page)).toBeVisible();

  await page.locator("h1").focus();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await expectClosesAfterSixSeconds(page);
});

test("Escape dismisses the card and focuses the paste field, from the card and from the field", async ({
  page,
  request,
}) => {
  const run = newRunId();
  await seed(page, request, run);

  await pasteOnly(page, `https://example.com/${run}/escape-card`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await openButton(page).focus();
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(pasteField(page)).toBeFocused();

  await pasteOnly(page, `https://example.com/${run}/escape-field`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await pasteField(page).focus();
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(pasteField(page)).toBeFocused();

  await pasteOnly(page, "not a url");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(pasteField(page)).toBeFocused();
});

test("Open moves focus to the Item's row and marks it for 1.8 s", async ({ page, request }) => {
  const run = newRunId();
  await seed(page, request, run);

  const id = await pasteForId(page, `https://example.com/${run}/open`);
  await expect(cardTitle(page)).toHaveText(ADDED);
  await openButton(page).click();

  await expect(pasteCard(page)).toBeHidden();
  await expect(rowOf(page, id).locator("a.it-open")).toBeFocused();
  await expect(rowOf(page, id)).toHaveClass(/\bis-back\b/u);
  await expect(rowOf(page, id)).not.toHaveClass(/\bis-back\b/u, { timeout: HIGHLIGHT_MS + 2000 });
});

test("a refresh of a known link shows Already saved, refreshed", async ({ page, request }) => {
  const run = newRunId();
  const { body } = await postLink(request, `https://example.com/${run}/known`);
  await openLibrary(page);

  await pasteOnly(page, body.item.originalUrl);
  await expect(cardTitle(page)).toHaveText(REFRESHED);
  await expect(openButton(page)).toBeVisible();
});
