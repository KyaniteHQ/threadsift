import { writeFile } from "node:fs/promises";

import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema, ItemReadResponseSchema } from "../src/http/schemas.ts";
import { newCode, newPassword } from "./access.ts";
import { type FreshScreen, openSignedIn } from "./fresh-screen.ts";
import { DESKTOP, storeSettings } from "./look.ts";

export const LIBRARY_SIZE = 3000;

export const PAGE_SIZE = 50;

const LAUNCH_AND_SEED_MS = 180_000;

export const SEEDED = {
  unread: 2250,
  read: 750,
  eachSource: 600,
  eachTopic: 1000,
  designTag: 1500,
  systemsTag: 428,
  alphaOfReddit: 200,
} as const;

export const TOPICS = ["Reading", "Writing", "Tools"] as const;

export const WORDS = ["alpha", "beta", "gamma"] as const;

const FIRST_SAVED_AT = Date.parse("2026-03-01T12:00:00Z");

const SOURCES = `CASE i % 5 WHEN 0 THEN 'reddit' WHEN 1 THEN 'x' WHEN 2 THEN 'github' WHEN 3 THEN 'article' ELSE 'other' END`;

const KINDS = `CASE i % 5 WHEN 0 THEN 'reddit-post' WHEN 1 THEN 'x-post' WHEN 2 THEN 'github-repo' WHEN 3 THEN 'article' ELSE 'link' END`;

const ITEM_ROWS = `
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${LIBRARY_SIZE})
INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title, author, community, fetched_at, read_state, fetch_result, topic_id)
SELECT ${SOURCES}, ${KINDS}, 'https://example.com/large/' || i, 'https://example.com/large/' || i,
  ${FIRST_SAVED_AT} - (i / 3) * 60000, 'ready',
  'Saved link number ' || i || ' about ' || CASE i % 3 WHEN 0 THEN '${WORDS[0]}' WHEN 1 THEN '${WORDS[1]}' ELSE '${WORDS[2]}' END,
  'author' || (i % 40), 'community' || (i % 25), ${FIRST_SAVED_AT},
  CASE WHEN i % 4 = 0 THEN 'read' ELSE 'unread' END, 'ok', 1 + i % 3
FROM n`;

const TOPIC_ROWS = `INSERT INTO topics (id, key, name) VALUES ${TOPICS.map(
  (name, index) => `(${index + 1}, '${name.toLowerCase()}', '${name}')`,
).join(", ")}`;

const TAG_ROWS = `INSERT INTO tags (id, key, name) VALUES (1, 'design', 'Design'), (2, 'systems', 'Systems')`;

const TAG_LINKS = `
INSERT INTO item_tags (item_id, tag_id) SELECT id, 1 FROM items WHERE id % 2 = 0;
INSERT INTO item_tags (item_id, tag_id) SELECT id, 2 FROM items WHERE id % 7 = 0`;

const TITLE_PARTS = `INSERT INTO search_parts (item_id, kind, body) SELECT id, 'title', title FROM items`;

const IdsSchema = z.array(z.object({ id: z.number() }));

export function seedLargeLibrary(screen: FreshScreen): readonly number[] {
  for (const statement of [TOPIC_ROWS, TAG_ROWS, ITEM_ROWS, TAG_LINKS, TITLE_PARTS]) {
    screen.fresh.sql(statement);
  }

  return screen.fresh
    .query("SELECT id FROM items ORDER BY saved_at DESC, id DESC", IdsSchema)
    .map(({ id }) => id);
}

type Json = z.infer<ReturnType<typeof z.json>>;

export async function attachJson(name: string, value: Json): Promise<void> {
  const path = test.info().outputPath(name);
  await writeFile(path, JSON.stringify(value, null, 2));
  await test.info().attach(name, { path, contentType: "application/json" });
}

export async function firstPage(
  request: APIRequestContext,
  params: Readonly<Record<string, string>>,
) {
  const response = await request.get("/api/items", { params });
  expect(response.status(), JSON.stringify(params)).toBe(200);

  return ItemListResponseSchema.parse(await response.json());
}

export async function pageAfter(
  request: APIRequestContext,
  params: Readonly<Record<string, string>>,
  cursor: string | null,
) {
  expect(cursor).not.toBeNull();
  const response = await request.get("/api/items", { params: { ...params, cursor: cursor ?? "" } });
  expect(response.status(), `after ${cursor}`).toBe(200);

  return ItemReadResponseSchema.parse(await response.json());
}

export async function walk(request: APIRequestContext, params: Readonly<Record<string, string>>) {
  const pages = [ItemReadResponseSchema.parse(await firstPage(request, params))];

  while (pages.at(-1)?.next !== null) {
    pages.push(await pageAfter(request, params, pages.at(-1)?.next ?? null));
  }

  return { pages, ids: pages.flatMap((page) => page.items.map(({ id }) => id)) };
}

export async function scrollUntil(page: Page, total: number): Promise<void> {
  const rows = page.locator("article.it");

  await expect
    .poll(
      async () => {
        await rows.last().scrollIntoViewIfNeeded();

        return rows.count();
      },
      { timeout: 180_000, intervals: [50] },
    )
    .toBe(total);
}

export function idsWhere(screen: FreshScreen, where: string): number[] {
  return screen.fresh
    .query(
      `SELECT id FROM items WHERE ${where} ORDER BY saved_at DESC, id DESC`,
      z.array(z.object({ id: z.number() })),
    )
    .map(({ id }) => id);
}

interface LargeLibrary {
  readonly screen: FreshScreen;
  readonly order: readonly number[];
}

export function largeLibrary(): () => LargeLibrary {
  test.describe.configure({ timeout: 600_000 });
  test.use({ trace: "off", video: "off", screenshot: "off", actionTimeout: 15_000 });

  let opened: LargeLibrary | null = null;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(LAUNCH_AND_SEED_MS);
    const screen = await openSignedIn(browser, newCode(), newPassword());
    opened = { screen, order: seedLargeLibrary(screen) };
  });

  test.afterAll(async () => {
    await opened?.screen.close();
  });

  return () => {
    if (opened === null) throw new Error("the library opens in beforeAll");

    return opened;
  };
}

export async function openLibrary(page: Page, layout: "list" | "grid", path = "/"): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await storeSettings(page, { layout, openAs: "page" }, path);
}

export function results(page: Page) {
  return page.locator("#results");
}
