import { type Locator, type Page, expect } from "@playwright/test";

import { groupedNumber } from "../src/core/contract/format.ts";
import { PAGE_SIZE } from "../src/core/contract/paging.ts";
import { NOTE_TITLE } from "../src/core/contract/reader-text.ts";
import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { DELETE_CONFIRM, DELETE_LABEL, REMOVE_GROUP } from "../web/src/reader-text.ts";
import { LOAD_MORE } from "../web/src/text.ts";
import { HIGHLIGHTS, NOTE, TITLE, keepHighlightsAndNote, sentence } from "./highlights-seed.ts";
import {
  atPhoneWidth,
  expectNoSidewaysScroll,
  expectScrollEnded,
  openFromMasthead,
} from "./screen-checks.ts";

const highlightAddress = (item: number, highlight: string): string =>
  `/api/items/${String(item)}/highlights/${highlight}`;

async function whileDeleteHeld(
  page: Page,
  address: string,
  act: () => Promise<void>,
): Promise<void> {
  const pattern = `**${address}`;
  const { promise: held, resolve: release } = Promise.withResolvers<void>();

  await page.route(pattern, async (route) => {
    if (route.request().method() === "DELETE") await held;
    await route.continue();
  });

  const removed = page.waitForResponse(
    (response) => response.url().endsWith(address) && response.request().method() === "DELETE",
  );

  await act();
  release();
  await removed;
  await page.unroute(pattern);
}

async function entryId(entry: Locator): Promise<string> {
  const id = await entry.getAttribute("data-highlight");

  if (id === null) throw new Error("A Highlights list entry has no data-highlight");

  return id;
}

async function removeKeepingMovedFocus(page: Page, item: number, mark: Locator, highlight: number) {
  const note = page.getByRole("textbox", { name: NOTE_TITLE, exact: true });

  await whileDeleteHeld(page, highlightAddress(item, String(highlight)), async () => {
    await mark.click();
    await page.getByRole("button", { name: REMOVE_GROUP, exact: true }).click();
    await note.focus();
  });
  await expect(mark).toHaveCount(0);
  await expect(note).toBeFocused();

  const listed = page.locator(".reader .hl-entry");
  const entryOf = (id: string) => page.locator(`.reader .hl-entry[data-highlight="${id}"]`);
  const focusedInRow = await entryId(listed.first());

  await whileDeleteHeld(page, highlightAddress(item, focusedInRow), async () => {
    await entryOf(focusedInRow).locator("button.btn").click();
    await entryOf(focusedInRow).locator("button.hl-quote").focus();
  });
  await expect(entryOf(focusedInRow)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);

  const unmoved = await entryId(listed.first());
  const neighbour = await entryId(listed.nth(1));

  await whileDeleteHeld(page, highlightAddress(item, unmoved), () =>
    entryOf(unmoved).locator("button.btn").click(),
  );
  await expect(entryOf(unmoved)).toHaveCount(0);
  await expect(entryOf(neighbour).locator("button.btn")).toBeFocused();
}

export async function highlightsFlow(page: Page): Promise<void> {
  const { item, oldestHighlight } = await keepHighlightsAndNote(page);

  await openFromMasthead(page, HIGHLIGHTS_PAGE.masthead);
  await expect(page).toHaveURL(/\/highlights$/u);
  await expect(page).toHaveTitle("Highlights, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: HIGHLIGHTS_PAGE.title })).toBeVisible();
  await expect(
    page.getByText(`${groupedNumber(HIGHLIGHTS)} highlights, 1 note`, { exact: true }),
  ).toBeVisible();

  const entries = page.locator(".hp-it");

  await expect(entries).toHaveCount(PAGE_SIZE);
  await expect(entries.first().locator(".hp-kind .label")).toHaveText(HIGHLIGHTS_PAGE.kindNote);
  await expect(entries.first()).toContainText(NOTE);
  await expect(entries.nth(1)).toContainText(sentence(1));

  await page.getByRole("button", { name: LOAD_MORE, exact: true }).click();
  await expect(entries).toHaveCount(HIGHLIGHTS + 1);
  await expect(entries.last()).toContainText(sentence(HIGHLIGHTS));
  await expect(page.getByRole("button", { name: LOAD_MORE, exact: true })).toHaveCount(0);

  await entries.last().getByRole("link", { name: TITLE }).click();
  await expect(page).toHaveURL(
    new RegExp(`/items/${String(item)}\\?highlight=${String(oldestHighlight)}$`, "u"),
  );

  const mark = page.locator(`.reader mark[data-highlights~="${String(oldestHighlight)}"]`);

  await expect(mark).toContainText(sentence(HIGHLIGHTS));
  await expect(mark).toBeFocused();
  await expect(mark).toBeInViewport();
  await expectScrollEnded(page.locator(".reader-slot"));

  await page.goto("/highlights");
  await atPhoneWidth(page, async () => {
    await expect(entries).toHaveCount(PAGE_SIZE);
    await expectNoSidewaysScroll(page);
  });

  await page.goto(`/items/${String(item)}`);
  await expect(mark).toBeInViewport();
  await removeKeepingMovedFocus(page, item, mark, oldestHighlight);
  await page.getByRole("button", { name: DELETE_LABEL, exact: true }).click();
  await page.getByRole("button", { name: DELETE_CONFIRM }).click();
  await expect(page).not.toHaveURL(new RegExp(`/items/${String(item)}`, "u"));
  await page.goto("/highlights");
  await expect(page.getByRole("heading", { name: HIGHLIGHTS_PAGE.emptyHeading })).toBeVisible();
}
