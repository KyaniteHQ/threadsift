import { type Page, expect } from "@playwright/test";

import { PAGE_SIZE } from "../src/core/contract/paging.ts";
import { HIGHLIGHTS_PAGE } from "../web/src/highlights-page-text.ts";
import { DELETE_CONFIRM, DELETE_LABEL } from "../web/src/reader-text.ts";
import { LOAD_MORE } from "../web/src/text.ts";
import { HIGHLIGHTS, NOTE, TITLE, keepHighlightsAndNote, sentence } from "./highlights-seed.ts";
import {
  atPhoneWidth,
  expectNoSidewaysScroll,
  expectScrollEnded,
  openSettings,
} from "./screen-checks.ts";

export async function highlightsFlow(page: Page): Promise<void> {
  const { item, oldestHighlight } = await keepHighlightsAndNote(page);

  await openSettings(page);
  await page.getByRole("link", { name: HIGHLIGHTS_PAGE.masthead, exact: true }).click();
  await expect(page).toHaveURL(/\/highlights$/u);
  await expect(page).toHaveTitle("Highlights, Threadsift");
  await expect(page.getByRole("heading", { level: 1, name: HIGHLIGHTS_PAGE.title })).toBeVisible();

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
  await page.getByRole("button", { name: DELETE_LABEL, exact: true }).click();
  await page.getByRole("button", { name: DELETE_CONFIRM }).click();
  await expect(page).not.toHaveURL(new RegExp(`/items/${String(item)}`, "u"));
  await page.goto("/highlights");
  await expect(page.getByRole("heading", { name: HIGHLIGHTS_PAGE.emptyHeading })).toBeVisible();
}
