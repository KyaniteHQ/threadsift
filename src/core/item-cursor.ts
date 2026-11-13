import { type SQL, eq, sql } from "drizzle-orm";

import type { Database } from "./ports.ts";
import { catalogLinking, searchReconciling } from "./schema.ts";

type ItemCursor = typeof catalogLinking | typeof searchReconciling;

async function restarted<Row>(
  db: Database,
  cursor: ItemCursor,
  pageAfter: (after: SQL) => Promise<readonly Row[]>,
): Promise<readonly Row[]> {
  const [saved] = await db.select().from(cursor).where(eq(cursor.id, 1));

  return (saved?.lastItemId ?? 0) > 0 ? pageAfter(sql`0`) : [];
}

export async function nextItemPage<Row extends Readonly<{ id: number }>>(
  db: Database,
  cursor: ItemCursor,
  pageAfter: (after: SQL) => Promise<readonly Row[]>,
): Promise<readonly Row[]> {
  const saved = sql`coalesce((select ${cursor.lastItemId} from ${cursor} where ${cursor.id} = 1), 0)`;
  const next = await pageAfter(saved);
  const page = next.length > 0 ? next : await restarted(db, cursor, pageAfter);
  const lastItemId = page.at(-1)?.id ?? 0;

  await db
    .insert(cursor)
    .values({ id: 1, lastItemId })
    .onConflictDoUpdate({ target: cursor.id, set: { lastItemId } });

  return page;
}
