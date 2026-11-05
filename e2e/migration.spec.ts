import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test } from "@playwright/test";
import { z } from "zod";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");

const Items = z.array(
  z.object({
    id: z.number(),
    title: z.string().nullable(),
    saved_at: z.number(),
    status: z.string(),
    reason: z.string().nullable(),
    fetch_result: z.string().nullable(),
  }),
);

function apply(database: DatabaseSync, file: string): void {
  database.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
}

test("Items stored before the ingest migration are ready with a null fetch result, keep their titles and saved dates, and have no job", () => {
  const database = new DatabaseSync(":memory:");

  for (const file of ["0000_init.sql", "0001_link_details.sql", "0002_access.sql"]) {
    apply(database, file);
  }

  database.exec(
    `INSERT INTO items (source, kind, normalized_url, original_url, saved_at, title) VALUES
      ('other', 'link', 'https://example.com/a', 'https://example.com/a', 1111, 'A saved title'),
      ('reddit', 'link', 'https://reddit.com/r/x/comments/1', 'https://reddit.com/r/x/comments/1', 2222, NULL)`,
  );

  apply(database, "0003_ingest_jobs.sql");

  const items = Items.parse(
    database
      .prepare("SELECT id, title, saved_at, status, reason, fetch_result FROM items ORDER BY id")
      .all(),
  );

  expect(items).toEqual([
    {
      id: 1,
      title: "A saved title",
      saved_at: 1111,
      status: "ready",
      reason: null,
      fetch_result: null,
    },
    { id: 2, title: null, saved_at: 2222, status: "ready", reason: null, fetch_result: null },
  ]);

  expect(database.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 0 });
  database.close();
});
