import { type SQL, type SQLWrapper, and, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";

import type { Database } from "./database.ts";
import { logFailure } from "./failure-log.ts";
import { IMAGE_STEM, ITEM_FILES_ROOT, POST_TEXT_STEM } from "./file-keys.ts";
import {
  ITEM_JOB_KINDS,
  type JobKind,
  type UnownedJobKind,
  type WaitReason,
} from "./job-contract.ts";
import type { JobPorts } from "./job-outcome.ts";
import { type JobRow, exportRuns, items, jobs, restoreRuns } from "./schema.ts";

interface AttemptColumns {
  readonly itemId: SQLWrapper;
  readonly id: SQLWrapper;
  readonly attempts: SQLWrapper;
}

function literal(text: string) {
  return sql.raw(`'${text}'`);
}

function attemptFileKeys({ itemId, id, attempts }: Readonly<AttemptColumns>) {
  const folder = sql`${literal(ITEM_FILES_ROOT)} || ${itemId} || '/'`;

  return {
    postText: sql<string>`${folder} || ${literal(POST_TEXT_STEM)} || ${id} || '-' || ${attempts} || '.md'`,
    imagePrefix: sql<string>`${folder} || ${literal(IMAGE_STEM)} || ${id} || '-' || ${attempts} || '-'`,
  };
}

export const ATTEMPT_FILES = attemptFileKeys(jobs);

const openJobs = alias(jobs, "open_jobs");

export const OpenedJobsSchema = z.array(z.object({ id: z.number().int() }));

export function hasOpenJob(kind?: JobKind, itemId: Readonly<SQLWrapper> = sql`${items.id}`) {
  const kinds = kind === undefined ? ITEM_JOB_KINDS : [kind];

  return sql`(select 1 from ${jobs} as open_jobs where ${openJobs.itemId} = ${itemId} and ${openJobs.state} <> 'done' and ${openJobs.kind} in (${sql.join(
    kinds.map((each) => sql`${each}`),
    sql`, `,
  )}))`;
}

export function holding(job: Readonly<Pick<JobRow, "id" | "attempts" | "attemptGeneration">>) {
  return sql`exists (select 1 from ${jobs} where ${jobs.id} = ${job.id} and ${jobs.state} = 'running' and ${jobs.attempts} = ${job.attempts} and ${jobs.attemptGeneration} is ${job.attemptGeneration})`;
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

function queuedRow<ItemId extends typeof items.id | SQL.Aliased<null>>(
  itemId: ItemId,
  {
    kind,
    address,
    nextAttemptAt,
    attempts = 0,
    waitReason = null,
    page,
  }: Readonly<{
    kind: JobKind;
    address: string | Readonly<SQLWrapper>;
    nextAttemptAt: number;
    attempts?: number | undefined;
    waitReason?: WaitReason | null | undefined;
    page: string | null | Readonly<SQLWrapper>;
  }>,
) {
  return {
    id: sql<null>`null`.as("id"),
    kind: sql<JobKind>`${kind}`.as("kind"),
    itemId,
    address: sql<string>`${address}`.as("address"),
    state: sql<"queued">`'queued'`.as("state"),
    attempts: sql<number>`${attempts}`.as("attempts"),
    staleRequeues: sql<number>`0`.as("stale_requeues"),
    attemptGeneration: sql<null>`null`.as("attempt_generation"),
    attemptPending: sql<null>`null`.as("attempt_pending"),
    nextAttemptAt: sql<number>`${nextAttemptAt}`.as("next_attempt_at"),
    claimExpires: sql<null>`null`.as("claim_expires"),
    waitReason: sql<WaitReason | null>`${waitReason}`.as("wait_reason"),
    page: sql<string | null>`${page}`.as("page"),
  };
}

export function opening(
  db: Database,
  {
    kind,
    address,
    now,
    where,
    attempts,
    waitReason,
    page = null,
  }: Readonly<{
    kind: JobKind;
    address: string | Readonly<SQLWrapper>;
    now: number;
    attempts?: number;
    waitReason?: WaitReason;
    where: Readonly<SQLWrapper>;
    page?: string | null | undefined;
  }>,
) {
  return db
    .insert(jobs)
    .select(
      db
        .select(
          queuedRow(items.id, {
            kind,
            address,
            nextAttemptAt: now,
            attempts,
            waitReason,
            page,
          }),
        )
        .from(items)
        .where(sql`${where}`),
    )
    .onConflictDoNothing()
    .returning({ id: jobs.id });
}

const ADDRESS_ROOTS = { export: "exports", restore: "restores" } as const satisfies Readonly<
  Record<UnownedJobKind, string>
>;

export function unownedAddress(kind: UnownedJobKind, ownerId: number): string {
  return `${ADDRESS_ROOTS[kind]}/${String(ownerId)}`;
}

export function unownedOwnerId(kind: UnownedJobKind, address: string): number | null {
  const id = new RegExp(`^${ADDRESS_ROOTS[kind]}/(?<id>[1-9][0-9]{0,18})$`, "u").exec(address)
    ?.groups?.["id"];

  return id === undefined ? null : Number(id);
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
            address: sql`${ADDRESS_ROOTS[kind]} || '/' || ${owner.id}`,
            nextAttemptAt: Date.now(),
            page: sql`null`,
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
  ports: JobPorts,
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
      .where(and(eq(jobs.kind, kind), eq(jobs.address, address), ne(jobs.state, "done"))),
  );
}

export async function enqueueItemJobs(ports: JobPorts, itemId: number): Promise<void> {
  try {
    await enqueueRows(
      ports,
      await ports.db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.itemId, itemId), sql`${jobs.state} <> 'done'`)),
    );
  } catch (error) {
    logFailure("jobs-not-queued", { itemId }, error);
  }
}
