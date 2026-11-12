import { type SQL, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { TAG_KIND, closingWrites } from "./catalog-key-links.ts";
import { catalogKey } from "./catalog-key.ts";
import { loggedMerge } from "./log-writes.ts";
import { repointedPins } from "./pins.ts";
import type { Database } from "./ports.ts";
import { guardedBatch, pins, proposals, tags } from "./schema.ts";
import { REWRITE_UNIT_ITEMS, readRewrite } from "./tag-rewrite.ts";

export const UNITS_PER_ACCEPT = 50;

export type Acceptance =
  | "done"
  | "accepting"
  | "unknown"
  | "not-open"
  | "merge-busy"
  | "not-supported";

const fromTag = alias(tags, "from_tag");

const intoTag = alias(tags, "into_tag");

async function readRow(db: Database, id: number) {
  const [row] = await db
    .select({
      state: proposals.state,
      cursor: proposals.cursor,
      revision: sql<number>`coalesce(${proposals.unitRevision}, 0)`.as("revision"),
      fromId: sql<number>`${fromTag.id}`.as("from_id"),
      fromKey: sql<string>`${fromTag.key}`.as("from_key"),
      fromName: sql<string>`${fromTag.name}`.as("from_name"),
      intoId: sql<number>`${intoTag.id}`.as("into_id"),
      intoKey: sql<string>`${intoTag.key}`.as("into_key"),
      intoName: sql<string>`${intoTag.name}`.as("into_name"),
    })
    .from(proposals)
    .innerJoin(fromTag, eq(fromTag.id, proposals.fromTagId))
    .innerJoin(intoTag, eq(intoTag.id, proposals.intoTagId))
    .where(eq(proposals.id, id));

  return row;
}

type Row = NonNullable<Awaited<ReturnType<typeof readRow>>>;

function acceptingElsewhere(): SQL {
  return sql`exists (select 1 from ${proposals} where ${proposals.state} = 'accepting')`;
}

function unitGuard(id: number, row: Readonly<Row>): SQL {
  const names = sql`${proposals.id} = ${id} and ${proposals.fromTagId} = ${row.fromId} and ${proposals.intoTagId} = ${row.intoId} and exists (select 1 from ${tags} where ${tags.id} = ${row.fromId} and ${tags.key} = ${row.fromKey}) and exists (select 1 from ${tags} where ${tags.id} = ${row.intoId} and ${tags.key} = ${row.intoKey})`;

  return row.state === "open"
    ? sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'open') and not ${acceptingElsewhere()}`
    : sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'accepting' and coalesce(${proposals.unitRevision}, 0) = ${row.revision})`;
}

async function runUnit(db: Database, id: number, row: Readonly<Row>): Promise<boolean> {
  const from = { id: row.fromId, key: catalogKey(row.fromName), name: row.fromName };
  const into = { id: row.intoId, key: row.intoKey, name: row.intoName };
  const unit = await readRewrite(db, { from, into, after: row.cursor ?? 0 });
  const reachedEnd = unit.itemIds.length < REWRITE_UNIT_ITEMS;

  return guardedBatch(db, unitGuard(id, row), [
    db
      .update(proposals)
      .set({
        state: "accepting",
        moved: sql`coalesce(${proposals.moved}, 0) + ${unit.moving}`,
      })
      .where(eq(proposals.id, id)),
    db
      .insert(pins)
      .values({
        kind: "tag-merge",
        fromKey: from.key,
        fromName: from.name,
        intoTagId: into.id,
        createdAt: Date.now(),
      })
      .onConflictDoNothing(),
    repointedPins(db, from.id, into.id),
    ...unit.writes,
    db
      .update(proposals)
      .set({ cursor: reachedEnd ? 0 : unit.last, unitRevision: row.revision + 1 })
      .where(eq(proposals.id, id)),
    ...closingWrites(db, TAG_KIND, from.id, [
      loggedMerge(db, {
        proposalId: id,
        mergedFrom: from.name,
        mergedInto: into.name,
        when: TAG_KIND.unlinked(db, from.id),
      }),
    ]),
  ]);
}

export async function continueMerge(
  db: Database,
  id: number,
  budget: number,
): Promise<"done" | "accepting"> {
  const row = await readRow(db, id);

  if (row?.state !== "accepting") return "done";

  if (budget === 0) return "accepting";

  await runUnit(db, id, row);

  return continueMerge(db, id, budget - 1);
}

async function isTopicMerge(db: Database, id: number): Promise<boolean> {
  const [row] = await db
    .select({ kind: proposals.kind })
    .from(proposals)
    .where(eq(proposals.id, id));

  return row?.kind === "topic-merge";
}

export async function acceptProposal(db: Database, id: number): Promise<Acceptance> {
  const row = await readRow(db, id);

  if (row === undefined) return (await isTopicMerge(db, id)) ? "not-supported" : "unknown";

  if (row.state !== "open") return "not-open";

  const [elsewhere] = await db
    .select({ busy: sql<number>`${acceptingElsewhere()}` })
    .from(sql`(select 1)`);

  if (elsewhere?.busy === 1) return "merge-busy";

  if (!(await runUnit(db, id, row))) return acceptProposal(db, id);

  return (await readRow(db, id)) === undefined
    ? "done"
    : continueMerge(db, id, UNITS_PER_ACCEPT - 1);
}

export async function continueMerges(db: Database): Promise<void> {
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.state, "accepting"))
    .orderBy(asc(proposals.id));

  await rows.reduce(async (earlier, { id }) => {
    await earlier;
    await continueMerge(db, id, UNITS_PER_ACCEPT);
  }, Promise.resolve());
}
