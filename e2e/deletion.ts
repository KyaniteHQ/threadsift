import { expect } from "@playwright/test";
import { z } from "zod";

import type { Instance } from "./access.ts";

export const MANIFEST = [
  "ai_tasks",
  "digests",
  "github_repos",
  "item_tags",
  "jobs",
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

export function removeBehindTheApp(id: number): string {
  return `DELETE FROM items WHERE id = ${id}`;
}
