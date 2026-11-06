import { expect, test } from "@playwright/test";

import { NOTICES, READING_NOTE, RETRY_LABEL } from "../web/src/text.ts";
import { closeDelayOf, watchCardLife } from "./card-life.ts";
import {
  ADDED,
  CLOSE_MS,
  READING,
  SLOW_PAGE,
  TIMED_OUT,
  UNREACHABLE,
  alertRegion,
  cardTitle,
  countListReads,
  expectClosesAfterSixSeconds,
  pasteForId,
  pasteOnly,
  seed,
  unreachableUrl,
  watchAnnouncements,
  watchCard,
} from "./card.ts";
import { STALLED } from "./ingest.ts";
import {
  dismissButton,
  newRunId,
  pasteCard,
  pasteField,
  retryButton,
  rowOf,
  titledPage,
} from "./links.ts";

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
  await pasteCard(page).hover();
  await expect(pasteCard(page)).toContainText(READING_NOTE);
  await expect(pasteCard(page).getByRole("button")).toHaveCount(0);
  await expect(rowOf(page, id).locator(".skel i")).toBeVisible();
  await expect(rowOf(page, id).locator(".it-open")).toContainText("delay/3");

  await expect(cardTitle(page)).toHaveText(ADDED, { timeout: 30_000 });
  await expect(pasteCard(page)).toContainText(NOTICES["no-title"].text);
  await expect(pasteCard(page).locator(".ic.tone-warn")).toBeVisible();
  await expect(pasteCard(page).locator(".ic.tone-ok")).toHaveCount(0);
  await expect(dismissButton(page)).toBeVisible();
  await expect(pasteCard(page).getByRole("button")).toHaveCount(1);
  await expect(rowOf(page, id).locator(".skel")).toHaveCount(0);

  expect((await trace()).titles).toEqual([READING, ADDED]);
  reads.expectNoNewReads();
});

test("a host that stalls shows a failure with Try again and Dismiss, and the card closes itself while the row keeps the reason", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const run = newRunId();
  await seed(page, request, run);

  const announced = await watchAnnouncements(page);
  const life = await watchCardLife(page);
  const id = await pasteForId(page, `${STALLED}?run=${run}`);
  await expect(cardTitle(page)).toHaveText(READING);

  await expect(cardTitle(page)).toHaveText(TIMED_OUT, { timeout: 30_000 });
  const said = await announced();
  expect(
    said.polite.some((text) => text.startsWith(READING)),
    "the polite region said Reading the link",
  ).toBe(true);
  expect(said.alert.at(0), "the pre-mounted alert region got the failure").toContain(TIMED_OUT);
  expect(said.polite.join(" "), "the failure stayed out of the polite region").not.toContain(
    TIMED_OUT,
  );
  await expect(retryButton(page)).toBeVisible();
  await expect(dismissButton(page)).toBeVisible();
  await expect(alertRegion(page)).toContainText(TIMED_OUT);
  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TIMED_OUT);

  await expect(pasteCard(page)).toBeHidden({ timeout: 30_000 });
  expect(
    await closeDelayOf(life, "titleAt"),
    "ms from the failure card showing to its close",
  ).toBeGreaterThanOrEqual(CLOSE_MS - 50);
  await expect(rowOf(page, id).locator(".it-fail")).toContainText(TIMED_OUT);
});

test("the failure card holds while hovered, closes 6 s after the pointer leaves, and a timer close leaves focus where it was", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const run = newRunId();
  const first = await seed(page, request, run);
  const life = await watchCardLife(page);

  const id = await pasteForId(page, unreachableUrl(run));
  await pasteCard(page).hover();
  await expect(cardTitle(page)).toHaveText(UNREACHABLE, { timeout: 30_000 });
  await page.waitForTimeout(CLOSE_MS + 1500);
  await expect(pasteCard(page)).toBeVisible();

  await rowOf(page, first.id).locator("a.it-open").focus();
  await page.locator("h1").hover();
  await expect(pasteCard(page)).toBeHidden({ timeout: 30_000 });
  expect(
    await closeDelayOf(life, "leftAt"),
    "ms from the pointer leaving to the close",
  ).toBeGreaterThanOrEqual(CLOSE_MS - 50);
  await expect(rowOf(page, first.id).locator("a.it-open")).toBeFocused();
  await expect(rowOf(page, id).getByRole("button", { name: RETRY_LABEL })).toBeVisible();
});

test("Added closes itself after 6 s and leaves focus where it was", async ({ page, request }) => {
  const run = newRunId();
  const first = await seed(page, request, run);
  const life = await watchCardLife(page);

  await pasteOnly(page, titledPage(`Closes ${run}`));
  await expect(cardTitle(page)).toHaveText(ADDED);
  await expect(pasteCard(page).locator(".ic.tone-ok")).toBeVisible();
  const link = rowOf(page, first.id).locator("a.it-open");
  await link.focus();

  await expect(pasteCard(page)).toBeHidden({ timeout: 30_000 });
  expect(
    await closeDelayOf(life, "titleAt"),
    "ms from Added showing to its close",
  ).toBeGreaterThanOrEqual(CLOSE_MS - 50);
  await expect(link).toBeFocused();
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
  await dismissButton(page).focus();
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
  await dismissButton(page).focus();
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
  await expect(pasteCard(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pasteCard(page)).toBeHidden();
  await expect(pasteField(page)).toBeFocused();
});
