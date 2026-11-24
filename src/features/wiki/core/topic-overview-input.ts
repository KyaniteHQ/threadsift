import { and, desc, eq, sql } from "drizzle-orm";

import { fitsAiInput } from "../../../core/contract/ai-contract.ts";
import {
  ADDED_READ_LIMIT,
  type BuiltFrom,
  citedIds,
} from "../../../core/contract/topic-overview-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { readStoredDigest } from "../../../core/kernel/digest-stored.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import { digests, items, topicPages, topics } from "../../../core/kernel/schema.ts";
import { among } from "../../../core/kernel/sql-expressions.ts";
import { notBuiltFrom, removedItemIds } from "./topic-coverage.ts";
import { overviewWithout } from "./topic-overview-prune.ts";

const ALL_ROWS = Number.MAX_SAFE_INTEGER;

const REMOVED_LIMIT = 200;

const KEY_POINTS_SENT = 3;

interface AddedItem {
  readonly id: number;
  readonly digest: number;
  readonly title: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
}

export interface OverviewRead {
  readonly name: string;
  readonly page: {
    readonly overview: string | null;
    readonly revision: number;
    readonly builtFrom: BuiltFrom;
  } | null;
  readonly added: readonly AddedItem[];
  readonly unreadable: number;
  readonly removed: readonly number[];
  readonly removedTotal: number;
}

export interface OverviewPrompt {
  readonly input: string;
  readonly current: string | null;
  readonly included: readonly AddedItem[];
  readonly citable: readonly number[];
  readonly mustChange: boolean;
}

export interface OverviewBasis {
  readonly page: { readonly revision: number; readonly builtFrom: BuiltFrom } | null;
  readonly removed: readonly number[];
  readonly removedTotal: number;
}

export interface OverviewSent {
  readonly current: string | null;
  readonly included: readonly Readonly<Pick<AddedItem, "id" | "digest">>[];
}

interface AddedRow {
  readonly id: number;
  readonly digest: number;
  readonly stored: string;
}

function addedItem(row: Readonly<AddedRow>) {
  const read = readStoredDigest(row.stored);

  if (read.kind === "unreadable") {
    logFailure("topic-digest-unreadable", { itemId: row.id }, read.cause);

    return [];
  }

  const { title, summary, keyPoints } = read.digest;

  return [
    {
      id: row.id,
      digest: row.digest,
      title,
      summary,
      keyPoints: keyPoints.slice(0, KEY_POINTS_SENT),
    },
  ];
}

function addedRows(db: Database, topicId: number) {
  return db
    .select({ id: items.id, digest: digests.taskId, stored: digests.digest })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(
      and(
        eq(items.topicId, topicId),
        notBuiltFrom(topicId, sql`${items.id}`, sql`${digests.taskId}`),
      ),
    )
    .orderBy(desc(digests.createdAt), desc(items.id));
}

interface AddedRead {
  readonly readable: readonly AddedItem[];
  readonly unreadable: number;
}

async function addedFrom(
  db: Database,
  topicId: number,
  first: readonly AddedRow[],
): Promise<AddedRead> {
  const readable = first.flatMap((row) => addedItem(row));

  if (readable.length > 0 || first.length < ADDED_READ_LIMIT) {
    return { readable, unreadable: first.length - readable.length };
  }

  const rest = await addedRows(db, topicId).limit(ALL_ROWS).offset(first.length);
  const later = rest.flatMap((row) => addedItem(row));

  return {
    readable: later.slice(0, ADDED_READ_LIMIT),
    unreadable: first.length + rest.length - later.length,
  };
}

async function withCitedRemoved(
  db: Database,
  topicId: number,
  { read, overview }: Readonly<{ read: readonly number[]; overview: string | null }>,
): Promise<readonly number[]> {
  const cited = overview === null ? [] : citedIds(overview);

  if (cited.length === 0) return read;

  const gone = await db
    .select({ id: sql<number>`gone.id` })
    .from(sql`(${removedItemIds(topicId)}) as gone`)
    .where(among(sql`gone.id`, cited));

  return [...new Set([...read, ...gone.map(({ id }) => id)])];
}

export async function readOverview(db: Database, topicId: number): Promise<OverviewRead | null> {
  const [[topic], [page], added, gone, [counted]] = await db.batch([
    db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId)),
    db
      .select({
        overview: topicPages.overview,
        revision: topicPages.revision,
        builtFrom: topicPages.builtFrom,
      })
      .from(topicPages)
      .where(eq(topicPages.topicId, topicId)),
    addedRows(db, topicId).limit(ADDED_READ_LIMIT),
    db
      .select({ id: sql<number>`gone.id` })
      .from(sql`(${removedItemIds(topicId)}) as gone`)
      .limit(REMOVED_LIMIT),
    db.select({ total: sql<number>`count(*)` }).from(sql`(${removedItemIds(topicId)}) as gone`),
  ]);

  if (topic === undefined) return null;

  const { readable, unreadable } = await addedFrom(db, topicId, added);

  const removed = await withCitedRemoved(db, topicId, {
    read: gone.map(({ id }) => id),
    overview: page?.overview ?? null,
  });

  return {
    name: topic.name,
    page: page ?? null,
    added: readable,
    unreadable,
    removed,
    removedTotal: counted?.total ?? 0,
  };
}

function promptJson(
  { name }: Readonly<Pick<OverviewRead, "name">>,
  current: string | null,
  added: readonly AddedItem[],
): string {
  return JSON.stringify({
    topic: name,
    overview: current,
    added: added.map(({ id, title, summary, keyPoints }) => ({ id, title, summary, keyPoints })),
  });
}

function fitted(
  read: Readonly<OverviewRead>,
  {
    current,
    included,
    item,
  }: Readonly<{
    current: string | null;
    included: readonly AddedItem[];
    item: AddedItem;
  }>,
): AddedItem | null {
  const fewest = included.length === 0 ? 0 : item.keyPoints.length;

  for (let count = item.keyPoints.length; count >= fewest; count -= 1) {
    const cut = { ...item, keyPoints: item.keyPoints.slice(0, count) };

    if (fitsAiInput(promptJson(read, current, [...included, cut]))) return cut;
  }

  return null;
}

export function overviewPrompt(read: Readonly<OverviewRead>): OverviewPrompt {
  const included: AddedItem[] = [];

  const gone = new Set(read.removed);

  const current = overviewWithout(read.page?.overview ?? null, read.removed);

  for (const item of read.added) {
    const sent = fitted(read, { current, included, item });

    if (sent === null) break;

    included.push(sent);
  }

  const kept = (read.page?.builtFrom ?? []).map(({ item }) => item).filter((id) => !gone.has(id));

  return {
    input: promptJson(read, current, included),
    current,
    included,
    citable: [...kept, ...included.map(({ id }) => id)],
    mustChange: current === null,
  };
}

export async function topicOfItem(db: Database, itemId: number): Promise<number | null> {
  const [row] = await db.select({ topicId: items.topicId }).from(items).where(eq(items.id, itemId));

  return row?.topicId ?? null;
}
