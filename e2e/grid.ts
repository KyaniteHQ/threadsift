import { type Locator, type Page, expect } from "@playwright/test";

import type { FreshScreen } from "./fresh-screen.ts";
import { storeSettings } from "./look.ts";
import { type SeedRow, row, seedRows } from "./reader.ts";

export const CARDS = 14;

export const BAND_COLUMNS = [
  { width: 1920, columns: 4 },
  { width: 1600, columns: 4 },
  { width: 1440, columns: 4 },
  { width: 1439, columns: 3 },
  { width: 1300, columns: 3 },
  { width: 1080, columns: 3 },
  { width: 900, columns: 3 },
  { width: 760, columns: 3 },
  { width: 759, columns: 2 },
  { width: 600, columns: 2 },
  { width: 480, columns: 2 },
  { width: 479, columns: 1 },
  { width: 390, columns: 1 },
] as const;

export const PAGE_MAX = 1480;

const TOPICS = ["Reading", "Writing"] as const;

function rowsOf(count: number): readonly SeedRow[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/card-${index + 1}`,
    title: `Card number ${index + 1}`,
    source: index % 2 === 0 ? ("reddit" as const) : ("article" as const),
    kind: index % 2 === 0 ? "reddit-post" : "article",
    postText: `Card ${index + 1} post text.`,
  }));
}

export function seedCards(screen: FreshScreen): readonly number[] {
  const ids = seedRows(screen, rowsOf(CARDS));

  screen.fresh.sql(
    TOPICS.map(
      (name, index) =>
        `INSERT INTO topics (id, key, name) VALUES (${index + 1}, '${name.toLowerCase()}', '${name}')`,
    ).join("; "),
  );

  screen.fresh.sql(
    ids
      .map(
        (id, index) =>
          `UPDATE items SET topic_id = ${(index % TOPICS.length) + 1} WHERE id = ${id}`,
      )
      .join("; "),
  );

  return ids;
}

export async function showGrid(
  page: Page,
  openAs: "page" | "sheet",
  url = "/",
  extra: Readonly<Record<string, string>> = {},
): Promise<void> {
  await storeSettings(page, { layout: "grid", openAs, ...extra }, url);
}

export function link(page: Page, id: number): Locator {
  return row(page, id).locator("a.it-open");
}

export function columnsOf(page: Page): Promise<number> {
  return page
    .locator("article.it")
    .evaluateAll(
      (cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().x))).size,
    );
}

export function sheet(page: Page): Locator {
  return page.locator("dialog.sheet");
}

export async function expectInView(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  const height = page.viewportSize()?.height ?? 0;

  expect(box?.y, "the card starts inside the window").toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0), "the card ends inside the window").toBeLessThanOrEqual(
    height,
  );
}
