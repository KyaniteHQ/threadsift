import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import { ItemListResponseSchema } from "../src/http/schemas.ts";
import type { FreshScreen } from "./fresh-screen.ts";

export const BOOK = "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm";
export const BOOK_LATE_WORD = "untinctured";
export const BOOK_CUT_BYTES = 500_000;
export const CHUNK_UNITS = 125_000;

export async function listed(request: APIRequestContext, params: Readonly<Record<string, string>>) {
  const response = await request.get("/api/items", { params });

  return { status: response.status(), response };
}

export async function matchesInOrder(
  request: APIRequestContext,
  q: string,
  more: Readonly<Record<string, string>> = {},
): Promise<number[]> {
  const { status, response } = await listed(request, { q, ...more });

  if (status !== 200) throw new Error(`GET /api/items?q=${q} answered ${status}`);

  return ItemListResponseSchema.parse(await response.json()).items.map(({ id }) => id);
}

export async function matches(
  request: APIRequestContext,
  q: string,
  more: Readonly<Record<string, string>> = {},
): Promise<number[]> {
  return (await matchesInOrder(request, q, more)).toSorted((left, right) => left - right);
}

export async function expectFinds(
  request: APIRequestContext,
  expectations: readonly (readonly [string, readonly number[]])[],
): Promise<void> {
  for (const [q, ids] of expectations) {
    expect(await matches(request, q), `q=${q}`).toEqual(ids.toSorted((a, b) => a - b));
  }
}

export function checkIndex(screen: FreshScreen): void {
  screen.fresh.sql("INSERT INTO search_index(search_index, rank) VALUES ('integrity-check', 1)");
}

export function partsOf(screen: FreshScreen, id: number) {
  return screen.fresh.query(
    `SELECT kind, length(body) AS length FROM search_parts WHERE item_id = ${id} ORDER BY id`,
    z.array(z.object({ kind: z.string(), length: z.number() })),
  );
}

export function seedItem(
  screen: FreshScreen,
  fields: Readonly<{ url: string; title?: string; postText?: string; savedAt?: number }>,
): void {
  const title = fields.title === undefined ? "NULL" : `'${fields.title}'`;
  const text = fields.postText ?? "NULL";

  screen.fresh.sql(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, status, title, post_text) VALUES ('article', 'article', '${fields.url}', '${fields.url}', ${fields.savedAt ?? Date.now()}, 'ready', ${title}, ${text})`,
  );
}

export function idAt(screen: FreshScreen, url: string): number {
  const [row] = screen.fresh.query(
    `SELECT id FROM items WHERE normalized_url = '${url}'`,
    z.array(z.object({ id: z.number() })),
  );

  if (row === undefined) throw new Error(`no Item at ${url}`);

  return row.id;
}

export function digestOf(title: string, tag: string, summary: string) {
  return { title, topic: "Reading", tags: [tag], summary, keyPoints: ["Kept."] } as const;
}

export const SWEEP_TIMEOUT_MS = 150_000;
