import { and, eq, isNotNull, sql } from "drizzle-orm";

import type { JobKind } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { items, jobs } from "./schema.ts";

export function hasOpenJob(kind: JobKind) {
  return sql`(select 1 from ${jobs} where ${jobs.itemId} = ${items.id} and ${jobs.kind} = ${kind} and ${jobs.state} <> 'done')`;
}

export function openingJob(
  db: Database,
  {
    kind,
    address,
    normalizedUrl,
    now,
  }: Readonly<{
    kind: JobKind;
    address: string;
    normalizedUrl: string;
    now: number;
  }>,
) {
  return db
    .insert(jobs)
    .select(
      db
        .select({
          id: sql<null>`null`.as("id"),
          kind: sql<JobKind>`${kind}`.as("kind"),
          itemId: items.id,
          address: sql<string>`${address}`.as("address"),
          state: sql<"queued">`'queued'`.as("state"),
          attempts: sql<number>`0`.as("attempts"),
          nextAttemptAt: sql<number>`${now}`.as("next_attempt_at"),
          claimExpires: sql<null>`null`.as("claim_expires"),
        })
        .from(items)
        .where(
          and(
            eq(items.normalizedUrl, normalizedUrl),
            kind === "digest" ? isNotNull(items.postText) : undefined,
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}
