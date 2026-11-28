import { eq } from "drizzle-orm";

import { statusIdOf } from "../../../core/contract/links.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { items } from "../../../core/kernel/schema.ts";
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
  const parsed = statusId === null ? null : parseJoinedXThread(joined, statusId, false);

  return parsed?.kind === "thread" ? parsed.thread : null;
}
