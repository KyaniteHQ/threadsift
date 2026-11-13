import { type SQL, and, eq, or, sql } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { catalogKey } from "./catalog-key.ts";
import type { MergeKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { pins, tags, topics } from "./schema.ts";

interface Resolution {
  readonly kind: MergeKind;
  readonly key: string;
  readonly pin: string;
}

interface PinnedDigest {
  readonly tags: readonly string[];
  readonly topic: string;
  readonly renamed: boolean;
  readonly current: SQL;
}

export function renamedTags(
  names: readonly string[],
  rename: (key: string) => string | undefined,
): readonly string[] {
  const kept = new Map<string, string>();

  for (const name of names) {
    const renamed = rename(catalogKey(name)) ?? name;
    const key = catalogKey(renamed);

    if (!kept.has(key)) kept.set(key, renamed);
  }

  return [...kept.values()];
}

export function repointedPins(db: Database, loser: number, survivor: number) {
  return db.update(pins).set({ intoTagId: survivor }).where(eq(pins.intoTagId, loser));
}

export function repointedTopicPins(db: Database, loser: number, survivor: number) {
  return db.update(pins).set({ intoTopicId: survivor }).where(eq(pins.intoTopicId, loser));
}

function pinToken(id: number, target: number): string {
  return `${String(id)}:${String(target)}`;
}

function resolutionHolds(resolutions: readonly Readonly<Resolution>[]): SQL {
  const wanted = JSON.stringify(resolutions);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where coalesce((select ${pins.id} || ':' || coalesce(${pins.intoTagId}, ${pins.intoTopicId}) from ${pins} where ${pins.kind} = json_extract(wanted.value, '$.kind') and ${pins.fromKey} = json_extract(wanted.value, '$.key')), '') <> json_extract(wanted.value, '$.pin'))`;
}

function resolutionOf(
  kind: MergeKind,
  key: string,
  row: Readonly<{ id: number; target: number }> | undefined,
): Resolution {
  return { kind, key, pin: row === undefined ? "" : pinToken(row.id, row.target) };
}

function keysAmong(keys: readonly string[]) {
  return sql`${pins.fromKey} in (select value from json_each(${JSON.stringify(keys)}))`;
}

function pinsFor(db: Database, tagKeys: readonly string[], topicKey: string) {
  return db
    .select({
      kind: pins.kind,
      key: pins.fromKey,
      id: pins.id,
      target: sql<number>`coalesce(${pins.intoTagId}, ${pins.intoTopicId})`,
      intoName: sql<string>`coalesce(${tags.name}, ${topics.name})`,
    })
    .from(pins)
    .leftJoin(tags, eq(tags.id, pins.intoTagId))
    .leftJoin(topics, eq(topics.id, pins.intoTopicId))
    .where(
      or(
        and(eq(pins.kind, "tag-merge"), keysAmong(tagKeys)),
        and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, topicKey)),
      ),
    );
}

export async function pinnedDigest(
  db: Database,
  digest: Readonly<Pick<Digest, "tags" | "topic">>,
): Promise<PinnedDigest> {
  const tagKeys = [...new Set(digest.tags.map((name) => catalogKey(name)))];
  const topicKey = catalogKey(digest.topic);

  const found = await pinsFor(db, tagKeys, topicKey);

  const tagPins = new Map(
    found.filter(({ kind }) => kind === "tag-merge").map((row) => [row.key, row]),
  );

  const topicPin = found.find(({ kind }) => kind === "topic-merge");

  const resolutions = [
    ...tagKeys.map((key) => resolutionOf("tag-merge", key, tagPins.get(key))),
    resolutionOf("topic-merge", topicKey, topicPin),
  ];

  return {
    tags:
      tagPins.size > 0
        ? renamedTags(digest.tags, (key) => tagPins.get(key)?.intoName)
        : digest.tags,
    topic: topicPin?.intoName ?? digest.topic,
    renamed: found.length > 0,
    current: resolutionHolds(resolutions),
  };
}
