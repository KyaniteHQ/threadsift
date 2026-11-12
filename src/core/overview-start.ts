import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { providerSet } from "./ai-tasks.ts";
import { guardedResults } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { digests, items, topicPages } from "./schema.ts";
import { hasOpenOverview } from "./topic-coverage.ts";
import { openingOverview } from "./topic-overview-open.ts";

export function newestOwner(topicId: number): SQL {
  return sql`(select owner.id from ${items} as owner join ${digests} as kept on kept.item_id = owner.id where owner.topic_id = ${topicId} order by owner.saved_at desc, owner.id desc limit 1)`;
}

export function overviewStartable(topicId: number): SQL {
  return sql`${providerSet()} and ${newestOwner(topicId)} is not null and not ${hasOpenOverview(topicId)}`;
}

export async function startOverview(
  ports: JobPorts,
  topicId: number,
  {
    when,
    after = [],
  }: Readonly<{ when?: Readonly<SQLWrapper>; after?: readonly BatchItem<"sqlite">[] }> = {},
): Promise<boolean> {
  const { db } = ports;

  const results = await guardedResults(db, and(overviewStartable(topicId), when) ?? sql`0`, [
    db.update(topicPages).set({ failure: null }).where(eq(topicPages.topicId, topicId)),
    openingOverview(db, newestOwner(topicId)),
    ...after,
  ]);

  if (results === null) return false;

  const [, queued] = results;

  await enqueueRows(ports, OpenedJobsSchema.parse(queued));

  return true;
}
