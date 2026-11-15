import { type SQLWrapper, eq, sql } from "drizzle-orm";

import { statusIdOf } from "./links.ts";
import type { Database } from "./ports.ts";
import type { Owner } from "./reddit-thread.ts";
import { items, redditComments, redditThreads } from "./schema.ts";
import type { StoredThread } from "./stored-thread.ts";
import type { JoinedAuthorThread } from "./x-author-thread.ts";
import { parseJoinedXThread } from "./x-thread.ts";

function storedReplies(itemId: number | Readonly<SQLWrapper>) {
  const generation = sql`max(coalesce((select max(newest.generation) from ${redditComments} as newest where newest.item_id = ${itemId} and newest.kind = 'comment'), -1), coalesce((select max(joined.generation) from ${redditThreads} as joined where joined.item_id = ${itemId} and joined.follow_ups > 0), -1))`;

  return sql<number>`((select count(*) from ${redditComments} as kept where kept.item_id = ${itemId} and kept.kind = 'comment' and kept.generation = ${generation}) + coalesce((select stored.follow_ups from ${redditThreads} as stored where stored.item_id = ${itemId} and stored.generation = ${generation}), 0))`;
}

export function repliesOf({
  nodes,
  followUps = 0,
}: Readonly<Pick<StoredThread, "nodes" | "followUps">>): number {
  return nodes.filter(({ kind }) => kind === "comment").length + followUps;
}

export function holdsAtLeastStored(itemId: number | Readonly<SQLWrapper>, replies: number) {
  return sql`${replies} >= ${storedReplies(itemId)}`;
}

export async function storedReplyCount(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
): Promise<number> {
  const [row] = await db.select({ stored: storedReplies(itemId) }).from(sql`(select 1)`);

  return row?.stored ?? 0;
}

export async function fewerThanStored(
  db: Database,
  owner: Readonly<Owner>,
  thread: Readonly<Pick<StoredThread, "nodes" | "followUps">>,
): Promise<boolean> {
  return repliesOf(thread) < (await storedReplyCount(db, owner.id));
}

export async function publishableThread(
  db: Database,
  itemId: number,
  joined: Readonly<JoinedAuthorThread>,
) {
  const [item] = await db
    .select({ normalizedUrl: items.normalizedUrl })
    .from(items)
    .where(eq(items.id, itemId));

  const statusId = item === undefined ? null : statusIdOf(item.normalizedUrl);
  const parsed = statusId === null ? null : parseJoinedXThread(joined, statusId);

  return parsed?.kind === "thread" ? parsed.thread : null;
}
