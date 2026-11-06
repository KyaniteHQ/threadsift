import { and, eq, exists, isNotNull, or, sql } from "drizzle-orm";

import { providerSet } from "./ai-settings.ts";
import { openingDigest, setDigestFailure } from "./digest-job.ts";
import { FETCH_DEADLINE_MS, fetchLink } from "./fetch-link.ts";
import type { JobOutcome, JobHandler, JobPorts } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { type JobRow, digests, items } from "./schema.ts";
import { isRetryable, settle } from "./settle.ts";

async function titleOf(db: Database, itemId: number): Promise<string | null> {
  const [item] = await db.select({ title: items.title }).from(items).where(eq(items.id, itemId));

  return item?.title ?? null;
}

async function attemptFetch(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const fetched = await fetchLink(ports.network, ports.pages, job.address);
  const title = isRetryable(fetched.status) ? await titleOf(ports.db, job.itemId) : null;

  const fields = settle(fetched, title, Date.now());
  const storesText = fields.postText !== undefined && fields.postText !== null;

  const configured = or(isNotNull(items.pendingDigest), providerSet()) ?? sql`0`;

  const stored = storesText
    ? { ...fields, generation: sql`${items.generation} + 1` }
    : { ...fields, pendingDigest: null };

  return {
    writes: [
      ports.db.update(items).set(stored).where(eq(items.id, job.itemId)),
      ...(storesText
        ? [
            openingDigest(ports.db, {
              scope: and(eq(items.id, job.itemId), configured) ?? sql`0`,
              address: job.address,
              now: Date.now(),
            }).job,
            setDigestFailure(ports.db, job.itemId, false),
            setDigestFailure(
              ports.db,
              job.itemId,
              true,
              and(
                sql`not (${configured})`,
                exists(
                  ports.db
                    .select({ id: digests.itemId })
                    .from(digests)
                    .where(eq(digests.itemId, items.id)),
                ),
              ) ?? sql`0`,
            ),
          ]
        : []),
    ],
  };
}

export const fetchHandler: JobHandler = {
  deadlineMs: FETCH_DEADLINE_MS,
  blockedBy: [],
  attempt: attemptFetch,
  exhausted: (db, job) => [
    db.update(items).set({ status: "failed", reason: "gave-up" }).where(eq(items.id, job.itemId)),
  ],
};
