import { type SQL, and, eq, or, sql } from "drizzle-orm";

import { catalogKey, renamedTags } from "../contract/catalog-key.ts";
import type { Digest } from "../contract/digest-schema.ts";
import type { MergeKind } from "../contract/proposal-contract.ts";
import type { Database } from "../kernel/database.ts";
import { pins } from "../kernel/schema.ts";
import { among } from "../kernel/sql-expressions.ts";
import { MERGE, acrossKinds } from "./merge-kinds.ts";
import type { Side } from "./merge-unit.ts";

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

export function mergePinWrites(
  db: Database,
  kind: MergeKind,
  { from, into }: Readonly<{ from: Side; into: Side }>,
) {
  const { pin } = MERGE[kind];
  const target = pin.set(into.id);

  return [
    db
      .insert(pins)
      .values({
        kind,
        fromKey: from.key,
        fromName: from.name,
        ...target,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({ target: [pins.kind, pins.fromKey], set: target }),
    db.update(pins).set(target).where(eq(pin.column, from.id)),
  ];
}

function pinToken(id: number, target: number): string {
  return `${String(id)}:${String(target)}`;
}

function resolutionHolds(resolutions: readonly Readonly<Resolution>[]): SQL {
  const wanted = JSON.stringify(resolutions);

  return sql`not exists (select 1 from json_each(${wanted}) as wanted where coalesce((select ${pins.id} || ':' || ${acrossKinds((spec) => spec.pin.column)} from ${pins} where ${pins.kind} = json_extract(wanted.value, '$.kind') and ${pins.fromKey} = json_extract(wanted.value, '$.key')), '') <> json_extract(wanted.value, '$.pin'))`;
}

function resolutionOf(
  kind: MergeKind,
  key: string,
  row: Readonly<{ id: number; target: number }> | undefined,
): Resolution {
  return { kind, key, pin: row === undefined ? "" : pinToken(row.id, row.target) };
}

function pinsFor(db: Database, tagKeys: readonly string[], topicKey: string) {
  return db
    .select({
      kind: pins.kind,
      key: pins.fromKey,
      id: pins.id,
      target: acrossKinds<number>((spec) => spec.pin.column),
      intoName: acrossKinds<string>(
        ({ table, pin }) =>
          sql`(select ${table.name} from ${table} where ${table.id} = ${pin.column})`,
      ),
    })
    .from(pins)
    .where(
      or(
        and(eq(pins.kind, "tag-merge"), among(pins.fromKey, tagKeys)),
        and(eq(pins.kind, "topic-merge"), eq(pins.fromKey, topicKey)),
      ),
    );
}

export async function survivorOf(db: Database, kind: MergeKind, key: string): Promise<Side | null> {
  const { table, pin } = MERGE[kind];

  const [survivor] = await db
    .select({ id: table.id, key: table.key, name: table.name })
    .from(pins)
    .innerJoin(table, eq(table.id, pin.column))
    .where(and(eq(pins.kind, kind), eq(pins.fromKey, key)));

  return survivor ?? null;
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
