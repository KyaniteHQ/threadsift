import {
  type SQLWrapper,
  and,
  eq,
  exists,
  isNotNull,
  ne,
  not,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { AI_DEADLINE_MS, type AiRefused, parseStoredDigest, retriesAi } from "./ai-contract.ts";
import { TASKS, startCallerTask, runAiTask, expireAiTasks } from "./ai-tasks.ts";
import { readCatalog, linkOlderDigests } from "./catalog.ts";
import { publishing, readForPublishing } from "./digest-publish.ts";
import {
  type DigestInput,
  currency,
  generationCurrent,
  hasDigestSource,
  logSubmission,
  modelInput,
  readDigestText,
  refusedInput,
  setDigestFailure,
} from "./digest-source.ts";
import {
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
} from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { digests, insertGuard, items, settings } from "./schema.ts";

async function attemptDigest(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const { item, anchors } = await readForPublishing(ports.db, job.itemId);

  if (item === undefined) return { writes: markKeptDigest(ports.db, job.itemId) };

  if (!hasContent(item)) return emptyInput(ports.db, item);

  return item.pendingDigest === null
    ? attemptModel(ports, job, item)
    : attemptCaller(ports, job, item, item.pendingDigest, anchors);
}

function emptyInput(db: Database, item: Readonly<DigestInput>): JobOutcome {
  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), ...markKeptDigest(db, item.id)],
  };
}

function hasContent(item: Readonly<DigestInput>): boolean {
  return item.postText !== null || item.postTextKey !== null || item.hasComments;
}

async function attemptCaller(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  pendingDigest: string,
  anchors: Awaited<ReturnType<typeof readForPublishing>>["anchors"],
): Promise<JobOutcome> {
  const digest = parseStoredDigest(pendingDigest);

  const taskId = await startCallerTask(
    ports,
    pendingDigest,
    { inputRevision: item.generation, attempts: job.attempts + 1 },
    job,
  );

  if (taskId === null) return lostClaim(ports.db);

  return publishing(ports.db, item, digest, taskId, { executor: "caller" }, anchors);
}

async function attemptModel(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const filed = await readDigestText(ports, job, item);

  if ("outcome" in filed) return filed.outcome;

  const catalog = await readCatalog(ports.db);
  const prompt = await modelInput(ports.db, item, filed.text, catalog);

  if (prompt.kind === "too-large") return refusedInput(ports.db, item, prompt.fixedBytes);

  const result = await runAiTask(
    ports,
    TASKS.digest,
    {
      text: prompt.input,
      inputRevision: item.generation,
      attempts: job.attempts + 1,
      maxOutputTokens: prompt.maxOutputTokens,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostClaim(ports.db);

  if (result.taskId !== null) logSubmission(result.taskId, item, prompt.counts);

  if (result.kind !== "done") return refusedAi(ports.db, job, item, result);

  return publishing(ports.db, item, result.result, result.taskId, {
    executor: "model",
    provider: result.provider,
    model: result.model,
    version: catalog.version,
    staleRequeues: job.staleRequeues,
    submitted: prompt.submitted,
  });
}

function refusedAi(
  db: Database,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  result: Readonly<AiRefused & { readonly taskId: number | null }>,
): JobOutcome {
  const retriable = retriesAi(result);

  if (retriable && !isLastAttempt(job.attempts)) throw new Error(`Digest ${result.reason}`);

  const generation = generationCurrent(item);

  return {
    currency: currency(db, generation, result.taskId),
    failedAttempt: retriable,
    writes: [insertGuard(db, generation), setDigestFailure(db, item.id, true)],
  };
}

function lostClaim(db: Database): JobOutcome {
  return { writes: [insertGuard(db, sql`0`)] };
}

export const digestHandler: JobHandler = {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["fetch"],
  attempt: attemptDigest,
  exhausted: (db, job) => [setDigestFailure(db, job.itemId, true)],
};

export function openingDigest(
  db: Database,
  {
    scope,
    address,
    now,
  }: Readonly<{ scope: Readonly<SQLWrapper>; address: string | Readonly<SQLWrapper>; now: number }>,
) {
  const eligible = and(sql`${scope}`, hasDigestSource(), notExists(hasOpenJob("digest"))) ?? sql`0`;

  return { eligible, job: opening(db, { kind: "digest", address, now, where: eligible }) };
}

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await linkOlderDigests(db);
}

export function providerSet() {
  return sql`exists (select 1 from ${settings} where ${settings.id} = 1)`;
}

function keptDigest(db: Database) {
  return exists(
    db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id)),
  );
}

export function markKeptDigest(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  when: Readonly<SQLWrapper> = sql`1`,
) {
  return [
    setDigestFailure(db, itemId, false),
    setDigestFailure(db, itemId, true, and(keptDigest(db), sql`${when}`) ?? sql`0`),
  ];
}

export function digestAfterFetch(
  db: Database,
  job: Readonly<{ itemId: number | Readonly<SQLWrapper>; address: string }>,
) {
  const configured = or(isNotNull(items.pendingDigest), providerSet()) ?? sql`0`;

  return [
    openingDigest(db, {
      scope: and(eq(items.id, job.itemId), configured) ?? sql`0`,
      address: job.address,
      now: Date.now(),
    }).job,
    ...markKeptDigest(
      db,
      job.itemId,
      or(sql`not (${configured})`, not(hasDigestSource())) ?? sql`0`,
    ),
  ];
}

export function olderDigests(db: Database) {
  const older = openingDigest(db, {
    scope:
      and(
        ne(items.status, "failed"),
        eq(items.digestFailed, false),
        notExists(
          db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id)),
        ),
      ) ?? sql`0`,
    address: sql`${items.originalUrl}`,
    now: Date.now(),
  });

  return [
    db.update(items).set({ status: "processing", reason: null }).where(older.eligible),
    older.job,
  ];
}
