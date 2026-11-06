import { eq, sql } from "drizzle-orm";

import { loadAiConfig } from "./ai-settings.ts";
import { fetchLink } from "./fetch-link.ts";
import type { JobOutcome } from "./job-outcome.ts";
import type { JobPorts } from "./jobs.ts";
import type { Database } from "./ports.ts";
import { type JobRow, items, jobs } from "./schema.ts";
import { isRetryable, settle } from "./settle.ts";

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

export async function attemptFetch(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const fetched = await fetchLink(ports.network, ports.pages, job.address);
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  const fields = settle(fetched, title, Date.now());
  const storesText = fields.postText !== undefined && fields.postText !== null;
  const configured = storesText && (await loadAiConfig(ports)).state === "ready";

  return {
    kind: "finish",
    writes: [
      ports.db
        .update(items)
        .set({
          ...fields,
          generation: storesText ? sql`${items.generation} + 1` : sql`${items.generation}`,
          digestOutcome: configured ? "pending" : sql`${items.digestOutcome}`,
        })
        .where(eq(items.id, job.itemId)),
      ...(configured
        ? [
            ports.db
              .insert(jobs)
              .values({
                kind: "digest" as const,
                itemId: job.itemId,
                address: job.address,
                state: "queued" as const,
                nextAttemptAt: Date.now(),
              })
              .onConflictDoNothing(),
          ]
        : []),
    ],
  };
}
