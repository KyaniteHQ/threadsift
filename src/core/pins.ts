import { type SQL, and, eq, sql } from "drizzle-orm";

import type { Digest } from "./ai-contract.ts";
import { catalogKey } from "./catalog-key.ts";
import type { PinKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { pins, tags, topics } from "./schema.ts";

interface Resolution {
  readonly kind: PinKind;
  readonly key: string;
  readonly pin: string;
}

export interface PinnedDigest {
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
  kind: PinKind,
  key: string,
  row: Readonly<{ id: number; target: number }> | undefined,
): Resolution {
  return { kind, key, pin: row === undefined ? "" : pinToken(row.id, row.target) };
}

function tagPins(db: Database, keys: readonly string[]) {
  return db
    .select({
      key: pins.fromKey,
      id: pins.id,
      target: sql<number>`${pins.intoTagId}`,
      intoName: tags.name,
    })
    .from(pins)
    .innerJoin(tags, eq(tags.id, pins.intoTagId))
    .where(
      and(
        eq(pins.kind, "tag-merge"),
        sql`${pins.fromKey} in (select value from json_each(${JSON.stringify(keys)}))`,
      ),
    );
}

function topicPin(db: Database, key: string) {
  return db
    .select({ id: pins.id, target: sql<number>`${pins.intoTopicId}`, intoName: topics.name })
    .from(pins)
    .innerJoin(topics, eq(topics.id, pins.intoTopicId))
    .where(and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, key)));
}

export async function pinnedDigest(
  db: Database,
  digest: Readonly<Pick<Digest, "tags" | "topic">>,
): Promise<PinnedDigest> {
  const tagKeys = [...new Set(digest.tags.map((name) => catalogKey(name)))];
  const topicKey = catalogKey(digest.topic);

  const [foundTags, [pinnedTopic]] = await db.batch([tagPins(db, tagKeys), topicPin(db, topicKey)]);

  const byKey = new Map(foundTags.map((row) => [row.key, row]));

  const resolutions = [
    ...tagKeys.map((key) => resolutionOf("tag-merge", key, byKey.get(key))),
    resolutionOf("topic-merge", topicKey, pinnedTopic),
  ];

  return {
    tags:
      foundTags.length > 0
        ? renamedTags(digest.tags, (key) => byKey.get(key)?.intoName)
        : digest.tags,
    topic: pinnedTopic?.intoName ?? digest.topic,
    renamed: foundTags.length > 0 || pinnedTopic !== undefined,
    current: resolutionHolds(resolutions),
  };
}
