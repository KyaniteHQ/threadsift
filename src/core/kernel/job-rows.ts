import { type SQL, type SQLWrapper, and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import {
  IMAGE_STEM,
  ITEM_FILES_ROOT,
  POST_TEXT_STEM,
  type StoreRoot,
  isOwnerId,
  storePrefixText,
} from "../contract/file-keys.ts";
import {
  ITEM_JOB_KINDS,
  type JobKind,
  type JobState,
  type UnownedJobKind,
  type WaitReason,
} from "../contract/job-contract.ts";
import type { Database } from "./database.ts";
import { logFailure } from "./failure-log.ts";
import { guardedWrites, unlessRefused } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { jobIs, jobOpen } from "./job-tables.ts";
import { literal } from "./schema-checks.ts";
import { type JobRow, exportRuns, items, jobs, restoreRuns } from "./schema.ts";

interface AttemptColumns {
  readonly itemId: SQLWrapper;
  readonly id: SQLWrapper;
  readonly attempts: SQLWrapper;
}

function attemptFileKeys({ itemId, id, attempts }: Readonly<AttemptColumns>) {
  const folder = sql`${literal(ITEM_FILES_ROOT)} || ${itemId} || '/'`;

  return {
    postText: sql<string>`${folder} || ${literal(POST_TEXT_STEM)} || ${id} || '-' || ${attempts} || '.md'`,
    imagePrefix: sql<string>`${folder} || ${literal(IMAGE_STEM)} || ${id} || '-' || ${attempts} || '-'`,
  };
}

export const ATTEMPT_FILES = attemptFileKeys(jobs);

const QUEUED = "queued" satisfies JobState;

const openJobs = alias(jobs, "open_jobs");

export function jobIsOpen(id: number | SQLWrapper): SQL {
  return sql`exists (select 1 from ${jobs} where ${jobs.id} = ${id} and ${jobOpen()})`;
}

export function hasOpenJob(kind?: JobKind, itemId: Readonly<SQLWrapper> = sql`${items.id}`) {
  const kinds = kind === undefined ? ITEM_JOB_KINDS : [kind];

  return sql`(select 1 from ${jobs} as open_jobs where ${openJobs.itemId} = ${itemId} and ${jobOpen(openJobs.state)} and ${openJobs.kind} in (${sql.join(
    kinds.map((each) => sql`${each}`),
    sql`, `,
  )}))`;
}

export function holding(job: Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration">>) {
  return sql`exists (select 1 from ${jobs} where ${jobs.id} = ${job.id} and ${jobIs("running")} and ${jobs.attempts} = ${job.attempts} and ${jobs.attemptGeneration} is ${job.attemptGeneration})`;
}

export type OpeningWrite = BatchItem<"sqlite"> & {
  readonly _: { readonly result: readonly Readonly<{ id: number }>[] };
};

const OpenedSchema = z.array(z.object({ id: z.number().int() }));

export function guardedOpenings(
  db: Database,
  condition: Readonly<SQLWrapper>,
  {
    before,
    opening: openings,
    after = [],
  }: Readonly<{
    before: readonly BatchItem<"sqlite">[];
    opening: readonly OpeningWrite[];
    after?: readonly BatchItem<"sqlite">[];
  }>,
): Promise<readonly Readonly<{ id: number }>[] | null> {
  return unlessRefused(async () => {
    const results = await db.batch(
      guardedWrites(db, condition, [...before, ...openings, ...after]),
    );
    const first = 1 + before.length;

    return results
      .slice(first, first + openings.length)
      .flatMap((opened) => OpenedSchema.parse(opened));
  });
}

export function openingJob(
  db: Database,
  {
    kind,
    address,
    normalizedUrl,
    now,
    page,
  }: Readonly<{
    kind: JobKind;
    address: string;
    normalizedUrl: string;
    now: number;
    page?: string | null | undefined;
  }>,
) {
  return opening(db, { kind, address, now, page, where: eq(items.normalizedUrl, normalizedUrl) });
}

interface QueuedFields {
  readonly kind: JobKind;
  readonly address: string | Readonly<SQLWrapper>;
  readonly attempts?: number | undefined;
  readonly waitReason?: WaitReason | null | undefined;
  readonly page?: string | null | Readonly<SQLWrapper> | undefined;
  readonly topicId?: number | Readonly<SQLWrapper> | null | undefined;
}

function queuedRow<ItemId extends typeof items.id | SQL.Aliased<null>>(
  itemId: ItemId,
  {
    kind,
    address,
    nextAttemptAt,
    attempts = 0,
    waitReason = null,
    page = null,
    topicId = null,
  }: Readonly<QueuedFields & { nextAttemptAt: number }>,
) {
  return {
    id: sql<null>`null`.as("id"),
    kind: sql<JobKind>`${kind}`.as("kind"),
    itemId,
    address: sql<string>`${address}`.as("address"),
    state: sql<typeof QUEUED>`${literal(QUEUED)}`.as("state"),
    attempts: sql<number>`${attempts}`.as("attempts"),
    staleRequeues: sql<number>`0`.as("stale_requeues"),
    attemptGeneration: sql<null>`null`.as("attempt_generation"),
    attemptPending: sql<null>`null`.as("attempt_pending"),
    nextAttemptAt: sql<number>`${nextAttemptAt}`.as("next_attempt_at"),
    claimExpires: sql<null>`null`.as("claim_expires"),
    waitReason: sql<WaitReason | null>`${waitReason}`.as("wait_reason"),
    page: sql<string | null>`${page}`.as("page"),
    topicId: sql<number | null>`${topicId}`.as("topic_id"),
  };
}

export function opening(
  db: Database,
  { now, where, ...fields }: Readonly<QueuedFields & { now: number; where: Readonly<SQLWrapper> }>,
) {
  return db
    .insert(jobs)
    .select(
      db
        .select(queuedRow(items.id, { ...fields, nextAttemptAt: now }))
        .from(items)
        .where(sql`${where}`),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}

const ADDRESS_ROOTS = { export: "exports", restore: "restores" } as const satisfies Readonly<
  Record<UnownedJobKind, StoreRoot>
>;

function addressPrefix(kind: UnownedJobKind): string {
  return storePrefixText({ root: ADDRESS_ROOTS[kind], ownerId: null });
}

export function unownedAddress(kind: UnownedJobKind, ownerId: number): string {
  return `${addressPrefix(kind)}${String(ownerId)}`;
}

export function unownedOwnerId(kind: UnownedJobKind, address: string): number | null {
  const prefix = addressPrefix(kind);
  const id = address.startsWith(prefix) ? address.slice(prefix.length) : "";

  return isOwnerId(id) ? Number(id) : null;
}

export async function unownedRun<Run>(
  kind: UnownedJobKind,
  address: string,
  load: (id: number) => Promise<Run | undefined>,
): Promise<Run | null> {
  const ownerId = unownedOwnerId(kind, address);

  return ownerId === null ? null : ((await load(ownerId)) ?? null);
}

export function openingUnowned(
  db: Database,
  kind: UnownedJobKind,
  owner: typeof exportRuns | typeof restoreRuns,
  where: Readonly<SQLWrapper>,
) {
  return db
    .insert(jobs)
    .select(
      db
        .select(
          queuedRow(sql<null>`null`.as("item_id"), {
            kind,
            address: sql`${addressPrefix(kind)} || ${owner.id}`,
            nextAttemptAt: Date.now(),
          }),
        )
        .from(owner)
        .where(sql`${where}`),
    )
    .returning({ id: jobs.id });
}

export async function enqueueQuietly(
  ports: Pick<JobPorts, "jobs">,
  jobIds: readonly number[],
  delayMs: number,
): Promise<void> {
  if (jobIds.length === 0) return;

  try {
    await ports.jobs.enqueue(jobIds, delayMs);
  } catch (error) {
    logFailure("jobs-not-queued", { jobIds: jobIds.join(",") }, error);
  }
}

export function enqueueRows(
  ports: Readonly<Pick<JobPorts, "jobs">>,
  rows: readonly Readonly<{ id: number }>[],
): Promise<void> {
  return enqueueQuietly(
    ports,
    rows.map(({ id }) => id),
    0,
  );
}

export async function enqueueRunJobs(
  ports: JobPorts,
  { kind, address }: Readonly<Pick<JobRow, "kind" | "address">>,
): Promise<void> {
  await enqueueRows(
    ports,
    await ports.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.kind, kind), eq(jobs.address, address), jobOpen())),
  );
}

export async function enqueueItemJobs(ports: JobPorts, itemId: number): Promise<void> {
  try {
    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), jobOpen())),
    );
  } catch (error) {
    logFailure("jobs-not-queued", { itemId }, error);
  }
}
