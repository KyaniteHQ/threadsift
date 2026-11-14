import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { guardedWrite, refusedByGuard } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { providerSet } from "./provider-saved.ts";
import { digests, items } from "./schema.ts";
import { hasOpenOverview, openOverviewJob } from "./topic-coverage.ts";
import { openingOverview, overviewOpened } from "./topic-overview-run.ts";

type OverviewStart =
  | { readonly kind: "started" | "no-provider" | "no-items" | "stale" }
  | { readonly kind: "open"; readonly jobId: number };

function newestOwner(topicId: number): SQL {
  return sql`(select owner.id from ${items} as owner join ${digests} as kept on kept.item_id = owner.id where owner.topic_id = ${topicId} order by owner.saved_at desc, owner.id desc limit 1)`;
}

function overviewStartable(topicId: number): SQL {
  return sql`${providerSet()} and ${newestOwner(topicId)} is not null and not ${hasOpenOverview(topicId)}`;
}

async function refusalOf(ports: JobPorts, topicId: number): Promise<OverviewStart> {
  const [facts] = await ports.db
    .select({
      provider: sql<number>`${providerSet()}`,
      owner: sql<number | null>`${newestOwner(topicId)}`,
      openJob: sql<number | null>`${openOverviewJob(topicId)}`,
    })
    .from(sql`(select 1)`);

  if (facts?.provider !== 1) return { kind: "no-provider" };

  if (facts.owner === null) return { kind: "no-items" };

  return facts.openJob === null ? { kind: "stale" } : { kind: "open", jobId: facts.openJob };
}

export async function startOverview(
  ports: JobPorts,
  topicId: number,
  {
    when = sql`1`,
    after = [],
  }: Readonly<{ when?: Readonly<SQLWrapper>; after?: readonly BatchItem<"sqlite">[] }> = {},
): Promise<OverviewStart> {
  const { db } = ports;

  try {
    const queued = await guardedWrite(
      db,
      sql`${overviewStartable(topicId)} and ${when}`,
      openingOverview(db, newestOwner(topicId)),
      [...after, overviewOpened(db, topicId)],
    );

    if (queued === null) return await refusalOf(ports, topicId);

    await enqueueRows(ports, OpenedJobsSchema.parse(queued));

    return { kind: "started" };
  } catch (error) {
    if (refusedByGuard(error)) return { kind: "stale" };

    throw error;
  }
}
