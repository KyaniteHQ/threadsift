import { eq } from "drizzle-orm";

import { statusIdOf } from "../contract/links.ts";
import type { Database } from "../kernel/database.ts";
import { items } from "../kernel/schema.ts";
import type { JoinedAuthorThread } from "./x-author-thread.ts";
import { parseJoinedXThread } from "./x-thread.ts";

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
