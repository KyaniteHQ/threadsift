import { type Locator, type Page, expect } from "@playwright/test";
import { z } from "zod";

import type { FreshScreen } from "./fresh-screen.ts";
import { viewportAt } from "./look.ts";

export interface SeedRow {
  readonly url: string;
  readonly title: string | null;
  readonly source?: "article" | "reddit" | "x" | "github" | "other";
  readonly kind?: string;
  readonly author?: string;
  readonly postText?: string;
  readonly read?: boolean;
  readonly fetchResult?: string;
  readonly savedAt?: number;
}

const FIRST_SAVED_AT = Date.parse("2026-03-01T12:00:00Z");
const MINUTE_MS = 60_000;

function textLiteral(text: string): string {
  return `CAST(X'${Buffer.from(text).toString("hex")}' AS TEXT)`;
}

function quoted(value: string | undefined): string {
  return value === undefined ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function insertOf(seed: Readonly<SeedRow>, index: number): string {
  const text = seed.postText === undefined ? "NULL" : textLiteral(seed.postText);
  const savedAt = seed.savedAt ?? FIRST_SAVED_AT - index * MINUTE_MS;

  return `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title, author, post_text, read_state, fetch_result) VALUES (${quoted(seed.source ?? "article")}, ${quoted(seed.kind ?? "article")}, ${quoted(seed.url)}, ${quoted(seed.url)}, ${savedAt}, 'ready', ${seed.title === null ? "NULL" : quoted(seed.title)}, ${quoted(seed.author)}, ${text}, ${quoted(seed.read === true ? "read" : "unread")}, ${quoted(seed.fetchResult)})`;
}

export function rewritePostText(screen: FreshScreen, id: number, text: string): void {
  screen.fresh.sql(
    `UPDATE items SET post_text = ${textLiteral(text)}, fetched_at = ${Date.now()} WHERE id = ${id}`,
  );
}

const IdsSchema = z.array(z.object({ id: z.number() }));

const MAX_STATEMENT_CHARS = 60_000;

function batches(statements: readonly string[]): string[] {
  return statements.reduce<string[]>((groups, statement) => {
    const last = groups.at(-1);

    if (last !== undefined && last.length + statement.length < MAX_STATEMENT_CHARS) {
      groups[groups.length - 1] = `${last}; ${statement}`;
    } else {
      groups.push(statement);
    }

    return groups;
  }, []);
}

export function seedRows(screen: FreshScreen, rows: readonly SeedRow[]): readonly number[] {
  for (const group of batches(rows.map((seed, index) => insertOf(seed, index)))) {
    screen.fresh.sql(group);
  }

  screen.fresh.sql(
    "INSERT INTO search_parts (item_id, kind, body) SELECT id, 'title', title FROM items WHERE title IS NOT NULL AND id NOT IN (SELECT item_id FROM search_parts)",
  );

  return screen.fresh
    .query("SELECT id FROM items ORDER BY saved_at DESC, id DESC", IdsSchema)
    .map(({ id }) => id);
}

export function row(page: Page, id: number): Locator {
  return page.locator(`article.it[data-key="${id}"]`);
}

export function reader(page: Page): Locator {
  return page.locator(".reader");
}

export function slot(page: Page): Locator {
  return page.locator(".reader-slot");
}

export function bar(page: Page): Locator {
  return page.locator(".rd-bar");
}

export async function openLibrary(
  page: Page,
  width: number,
  path = "/",
  expectedRows = 1,
): Promise<void> {
  await viewportAt(page, width);
  await page.goto(path);
  await expect(page.locator("article.it")).toHaveCount(expectedRows);
}

export async function expectRowInPaneView(page: Page, key: number) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const box = document
            .querySelector(`article.it[data-key="${id}"]`)
            ?.getBoundingClientRect();

          const headerBottom = document.querySelector(".list-head")?.getBoundingClientRect().bottom;
          const paneBottom = document.querySelector(".list")?.getBoundingClientRect().bottom;

          return (
            box !== undefined &&
            headerBottom !== undefined &&
            paneBottom !== undefined &&
            box.top >= headerBottom - 0.5 &&
            box.bottom <= paneBottom + 0.5
          );
        }, key),
      { message: "the row sits between the list header and the bottom of the list pane" },
    )
    .toBe(true);
}

export async function openRow(page: Page, id: number): Promise<void> {
  await row(page, id).locator("a.it-open").click();
  await expect(reader(page)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${id}$`, "u"));
}

export async function readStateOf(page: Page, id: number): Promise<string> {
  const response = await page.request.get(`/api/items/${id}`);
  const body = z.object({ item: z.object({ readState: z.string() }) }).parse(await response.json());

  return body.item.readState;
}

export function paragraphs(count: number, label: string): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `${label} paragraph ${index + 1} holds a few ordinary sentences, so the Reader has something to scroll through and the reading place has something to land on.`,
  ).join("\n\n");
}

export function crowdedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const strip = document.querySelector(".rd-bar");

    if (strip === null) return ["the reader bar is missing"];

    const crowded: string[] = [];
    const edge = strip.getBoundingClientRect();
    const style = getComputedStyle(strip);
    const left = edge.left + Number(style.paddingLeft.replace("px", ""));
    const right = edge.right - Number(style.paddingRight.replace("px", ""));
    let previous: DOMRect | null = null;

    for (const part of document.querySelectorAll<HTMLElement>(
      ".rd-bar .rd-back, .rd-bar .rd-hint, .rd-bar .rd-cm, .rd-bar .st-gear, .rd-bar .rd-act",
    )) {
      const box = part.getBoundingClientRect();

      if (box.width > 0) {
        const name = `${part.className} "${part.textContent}"`;

        if (box.left < left - 0.5 || box.right > right + 0.5)
          crowded.push(`${name} leaves the bar`);

        if (part.scrollWidth > part.clientWidth + 1) crowded.push(`${name} is cut`);

        if (previous !== null && box.left < previous.right - 0.5) crowded.push(`${name} overlaps`);

        previous = box;
      }
    }

    return crowded;
  });
}
