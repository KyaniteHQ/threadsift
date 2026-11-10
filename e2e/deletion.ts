import { type APIRequestContext, expect } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";
import { POST, created, postRevision, selectorOf } from "./highlights.ts";
import { saved } from "./notes.ts";

export const MANIFEST = [
  "ai_tasks",
  "digests",
  "github_repos",
  "highlights",
  "item_aliases",
  "item_tags",
  "jobs",
  "media",
  "notes",
  "reddit_comments",
  "reddit_threads",
  "search_fingerprints",
  "search_parts",
] as const;

const Tables = z.array(z.object({ name: z.string(), sql: z.string().nullable() }));

const ITEM_ID_COLUMN = /(?<![\w])["`[]?item_id["`\]]?(?![\w])/iu;

const RowCounts = z.array(z.record(z.string(), z.number()));

export function itemKeyedTables(instance: Instance): string[] {
  return instance
    .query("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name", Tables)
    .filter(({ sql }) => sql !== null && ITEM_ID_COLUMN.test(sql))
    .map(({ name }) => name);
}

export function ownedRows(instance: Instance, id: number): Record<string, number> {
  const counts = [
    `(SELECT count(*) FROM items WHERE id = ${id}) AS items`,
    ...itemKeyedTables(instance).map(
      (table) => `(SELECT count(*) FROM ${table} WHERE item_id = ${id}) AS ${table}`,
    ),
  ];

  return instance.query(`SELECT ${counts.join(", ")}`, RowCounts)[0] ?? {};
}

export const NO_ROWS = Object.fromEntries(["items", ...MANIFEST].map((name) => [name, 0]));

export function expectEveryTableOwns(instance: Instance, id: number): void {
  expect(itemKeyedTables(instance), "the tables that name an Item").toEqual([...MANIFEST]);

  const rows = ownedRows(instance, id);

  for (const [name, n] of Object.entries(rows)) {
    expect(n, `rows of Item ${id} in ${name} before the delete`).toBeGreaterThan(0);
  }
}

export function expectNoOwnedRows(instance: Instance, id: number): void {
  expect(ownedRows(instance, id)).toEqual(NO_ROWS);
}

export function holdSweeps(instance: Instance): void {
  instance.sql(
    "INSERT INTO scheduled_runs (task, last_run_at) VALUES ('sweep', 9007199254740991) ON CONFLICT (task) DO UPDATE SET last_run_at = 9007199254740991",
  );
}

export function addGithubRepository(instance: Instance, id: number): void {
  instance.sql(
    `INSERT INTO github_repos (item_id, description, stars, language, license, topics, pushed_at) VALUES (${id}, NULL, 7, NULL, NULL, '[]', NULL)`,
  );
}

export function addMediaRow(instance: Instance, id: number, key: string): void {
  instance.sql(
    `INSERT INTO media (item_id, kind, source_url, position, outcome, file_key, content_type, size) VALUES (${id}, 'image', 'https://example.com/media-${id}.png', 0, 'stored', '${key}', 'image/png', 12)`,
  );
}

export async function addHighlight(
  request: APIRequestContext,
  id: number,
  text: string,
  quote: string,
): Promise<void> {
  await created(request, id, {
    target: POST,
    revision: await postRevision(request, id),
    selector: selectorOf(text, quote),
  });
}

export function removeBehindTheApp(id: number): string {
  return `DELETE FROM items WHERE id = ${id}`;
}

export async function addNote(request: APIRequestContext, id: number, body: string): Promise<void> {
  await saved(request, id, body, 0);
}
