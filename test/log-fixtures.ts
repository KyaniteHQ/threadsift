import { z } from "zod";

import { type LogEntry, LogPageSchema } from "../src/core/contract/log-contract.ts";
import type { Instance } from "./instance.ts";
import { count, exec, paste, rows } from "./related-fixtures.ts";

export function readLog(instance: Instance, query = "") {
  return instance.read("GET", `/api/log${query}`, LogPageSchema);
}

async function allEntries(instance: Instance): Promise<readonly LogEntry[]> {
  return (await readLog(instance)).entries;
}

function lineOf(entry: Readonly<LogEntry>): string {
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
    case "vault-file-skipped":
    case "vault-file-conflict":
      return `${entry.action} | ${entry.path}`;
    default:
      return entry satisfies never;
  }
}

export async function lines(instance: Instance): Promise<string[]> {
  return (await allEntries(instance)).map((entry) => lineOf(entry));
}

export function seedEntries(instance: Instance, entries: number, at: number): void {
  exec(instance, "insert or ignore into topics (key, name) values ('seeded', 'Seeded')");
  seedLogEntries(instance, { key: "seeded", entries, at });
}

export function seedLogEntries(
  instance: Instance,
  { key, entries, at }: Readonly<{ key: string; entries: number; at: number | "ascending" }>,
): void {
  const [topic] = rows(
    instance,
    z.object({ id: z.number(), name: z.string() }),
    "select id, name from topics where key = ?",
    key,
  );
  if (topic === undefined) throw new Error(`no Topic with key ${key}`);
  if (entries === 0) return;

  exec(
    instance,
    `with recursive n(i) as (select 1 union all select i + 1 from n where i < ?)
    insert into log_entries (at, action, topic, topic_id)
    select coalesce(?, i), 'topic', ?, ? from n`,
    entries,
    at === "ascending" ? null : at,
    topic.name,
    topic.id,
  );
}

export { paste };

export function entryCount(instance: Instance, action: string): number {
  return count(instance, "select count(*) as n from log_entries where action = ?", action);
}
