import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { z } from "zod";

import type { JobWrites } from "../src/core/job-outcome.ts";
import { type LogEntry, LogPageSchema } from "../src/core/log-contract.ts";
import type { Database } from "../src/core/ports.ts";
import { guards } from "../src/core/schema.ts";
import { openDatabase } from "../src/targets/node/database.ts";
import type { Instance } from "./instance.ts";
import { type Fixture, exec, paste, rows } from "./related-fixtures.ts";

export function readLog(instance: Instance, query = "") {
  return instance.read("GET", `/api/log${query}`, LogPageSchema);
}

export async function allEntries(instance: Instance): Promise<readonly LogEntry[]> {
  return (await readLog(instance)).entries;
}

export function lineOf(entry: Readonly<LogEntry>): string {
  switch (entry.action) {
    case "ingest":
    case "digest":
      return `${entry.action} | ${entry.item.title} | topic: ${entry.topic.name} | tags: ${entry.tags.join(", ")}`;
    case "topic":
      return `topic | ${entry.topic.name}`;
    case "overview":
      return `overview | ${entry.topic.name} | ${String(entry.added)} added, ${String(entry.removed)} removed`;
    case "related":
      return `related | ${entry.item.title} | ${String(entry.picks)} picks`;
    default:
      return entry satisfies never;
  }
}

export async function lines(instance: Instance): Promise<string[]> {
  return (await allEntries(instance)).map((entry) => lineOf(entry));
}

export function seedEntries(instance: Instance, count: number, at: number): void {
  exec(instance, "insert or ignore into topics (key, name) values ('seeded', 'Seeded')");
  exec(
    instance,
    `with recursive n(i) as (select 1 union all select i + 1 from n where i < ${String(count)})
     insert into log_entries (at, action, topic, topic_id)
     select ${String(at)}, 'topic', 'Seeded', (select id from topics where key = 'seeded') from n`,
  );
}

export { paste, type Fixture };

export async function commit(db: Database, writes: JobWrites): Promise<void> {
  const [first, ...rest] = writes;

  if (first !== undefined) await db.batch([first, ...rest, db.delete(guards)]);
}

export function startTask(instance: Instance, itemId: number): number {
  const database = new DatabaseSync(instance.databaseFile);

  try {
    const task = database
      .prepare(
        "insert into ai_tasks (kind, inputs, input_revision, executor, attempts, deadline, state, item_id) values ('digest', '', 0, 'caller', 1, ?, 'running', ?) returning id",
      )
      .get(Date.now() + 60_000, itemId);

    return z.object({ id: z.number() }).parse(task).id;
  } finally {
    database.close();
  }
}

export function entryCount(instance: Instance, action: string): number {
  return (
    rows(
      instance,
      z.object({ n: z.number() }),
      "select count(*) as n from log_entries where action = ?",
      action,
    )[0]?.n ?? 0
  );
}

export function openStored(instance: Instance) {
  return openDatabase(instance.databaseFile, join(import.meta.dirname, "..", "migrations"));
}
