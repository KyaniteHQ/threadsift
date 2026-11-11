import { and, desc, eq, sql } from "drizzle-orm";

import { type Digest, parseStoredDigest } from "./ai-contract.ts";
import { utf8Length } from "./digest-prompt.ts";
import { logFailure } from "./failure-log.ts";
import type { Database } from "./ports.ts";
import { digests, items, topicPages, topics } from "./schema.ts";
import { notBuiltFrom, removedItemIds } from "./topic-coverage.ts";
import type { BuiltFrom } from "./topic-overview-contract.ts";
import { overviewWithout } from "./topic-overview-prune.ts";
import { OVERVIEW_INPUT_BYTES } from "./topic-overview-task.ts";

const ADDED_READ_LIMIT = 40;

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
  readonly removed: readonly number[];
}

export interface OverviewPrompt {
  readonly input: string;
  readonly current: string | null;
  readonly included: readonly AddedItem[];
  readonly citable: readonly number[];
  readonly mustChange: boolean;
}

function addedItem(row: Readonly<{ id: number; digest: number; stored: string }>) {
  try {
    const { title, summary, keyPoints }: Digest = parseStoredDigest(row.stored);

    return [
      {
        id: row.id,
        digest: row.digest,
        title,
        summary,
        keyPoints: keyPoints.slice(0, KEY_POINTS_SENT),
      },
    ];
  } catch (error) {
    logFailure("topic-digest-unreadable", { itemId: row.id }, error);

    return [];
  }
}

export async function readOverview(db: Database, topicId: number): Promise<OverviewRead | null> {
  const [[topic], [page], added, gone] = await db.batch([
    db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId)),
    db
      .select({
        overview: topicPages.overview,
        revision: topicPages.revision,
        builtFrom: topicPages.builtFrom,
      })
      .from(topicPages)
      .where(eq(topicPages.topicId, topicId)),
    db
      .select({ id: items.id, digest: digests.taskId, stored: digests.digest })
      .from(items)
      .innerJoin(digests, eq(digests.itemId, items.id))
      .where(
        and(
          eq(items.topicId, topicId),
          notBuiltFrom(topicId, sql`${items.id}`, sql`${digests.taskId}`),
        ),
      )
      .orderBy(desc(digests.createdAt), desc(items.id))
      .limit(ADDED_READ_LIMIT),
    db
      .select({ id: sql<number>`gone.id` })
      .from(sql`(${removedItemIds(topicId)}) as gone`)
      .limit(REMOVED_LIMIT),
  ]);

  if (topic === undefined) return null;

  return {
    name: topic.name,
    page: page ?? null,
    added: added.flatMap((row) => addedItem(row)),
    removed: gone.map(({ id }) => id),
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

export function overviewPrompt(read: Readonly<OverviewRead>): OverviewPrompt {
  const included: AddedItem[] = [];

  const gone = new Set(read.removed);

  const current = overviewWithout(read.page?.overview ?? null, read.removed);

  for (const item of read.added) {
    if (utf8Length(promptJson(read, current, [...included, item])) > OVERVIEW_INPUT_BYTES) break;

    included.push(item);
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
