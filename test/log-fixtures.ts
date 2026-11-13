import { z } from "zod";

import { type LogEntry, LogPageSchema } from "../src/core/log-contract.ts";
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
    case "merge":
      return `merge | tag: ${entry.from} into ${entry.into} | ${String(entry.items)} Items`;
    case "merge-topic":
      return `merge | topic: ${entry.from} into ${entry.into} | ${String(entry.items)} Items`;
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
