import { type SQLWrapper, eq, sql } from "drizzle-orm";

import { statusIdOf } from "./links.ts";
import type { Database } from "./ports.ts";
import type { ParsedThread } from "./reddit-json.ts";
import type { Owner } from "./reddit-thread.ts";
import { items, redditComments } from "./schema.ts";
import { parseXThreadValue } from "./x-thread.ts";
import type { XThreadValue } from "./x-wire.ts";

function storedReplies(itemId: number | Readonly<SQLWrapper>) {
  return sql<number>`(select count(*) from ${redditComments} as kept where kept.item_id = ${itemId} and kept.kind = 'comment' and kept.generation = (select max(newest.generation) from ${redditComments} as newest where newest.item_id = ${itemId} and newest.kind = 'comment'))`;
}

export function holdsAtLeastStored(itemId: number, replies: number) {
  return sql`${replies} >= ${storedReplies(itemId)}`;
}

export async function fewerThanStored(
  db: Database,
  owner: Readonly<Owner>,
  { nodes }: Readonly<ParsedThread>,
): Promise<boolean> {
  const [row] = await db.select({ stored: storedReplies(owner.id) }).from(sql`(select 1)`);

  return nodes.filter(({ kind }) => kind === "comment").length < (row?.stored ?? 0);
}

export async function publishableThread(
  db: Database,
  itemId: number,
  value: Readonly<XThreadValue>,
) {
  const [item] = await db
    .select({ normalizedUrl: items.normalizedUrl })
    .from(items)
    .where(eq(items.id, itemId));

  const statusId = item === undefined ? null : statusIdOf(item.normalizedUrl);
  const parsed = statusId === null ? null : parseXThreadValue(value, statusId);

  return parsed?.kind === "thread" ? parsed.thread : null;
}
