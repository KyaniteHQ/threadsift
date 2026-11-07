import { type SQLWrapper, and, eq, isNotNull, ne, notExists, or, sql } from "drizzle-orm";

import {
  AI_DEADLINE_MS,
  parseStoredDigest,
  digestPrompt,
  type Digest,
  retriesAi,
} from "./ai-contract.ts";
import { TASKS, startCallerTask, completedAiTask, runAiTask, expireAiTasks } from "./ai-tasks.ts";
import {
  catalogEntries,
  catalogCurrent,
  linkingDigest,
  readCatalog,
  linkOlderDigests,
} from "./catalog.ts";
import {
  type DigestInput,
  currency,
  digestInput,
  generationCurrent,
  readDigestText,
  setDigestFailure,
} from "./digest-source.ts";
import {
  MAX_STALE_REQUEUES,
  type ClaimedJob,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
} from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { digests, insertGuard, items, settings } from "./schema.ts";
import { digestPartWrites } from "./search.ts";

async function attemptDigest(ports: JobPorts, job: Readonly<ClaimedJob>): Promise<JobOutcome> {
  const [item] = await digestInput(ports.db, job.itemId);

  if (item === undefined || (item.postText === null && item.postTextKey === null))
    return { writes: [setDigestFailure(ports.db, job.itemId, false)] };

  return item.pendingDigest === null
    ? attemptModel(ports, job, item)
    : attemptCaller(ports, job, item, item.pendingDigest);
}

async function attemptCaller(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
  pendingDigest: string,
): Promise<JobOutcome> {
  const digest = parseStoredDigest(pendingDigest);

  const taskId = await startCallerTask(
    ports,
    pendingDigest,
    { inputRevision: item.generation, attempts: job.attempts + 1 },
    job,
  );

  if (taskId === null) return lostClaim(ports.db);

  return publishing(ports.db, item, digest, taskId, { executor: "caller" });
}

async function attemptModel(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const filed = await readDigestText(ports, job, item);

  if ("outcome" in filed) return filed.outcome;

  const postText = filed.text;

  const catalog = await readCatalog(ports.db);

  const result = await runAiTask(
    ports,
    TASKS.digest,
    {
      text: digestPrompt(
        JSON.stringify({ title: item.title, source: item.source, postText }),
        catalog,
      ),
      inputRevision: item.generation,
      attempts: job.attempts + 1,
    },
    job,
  );

  if (result.kind === "claim-lost") return lostClaim(ports.db);

  if (result.kind !== "done") {
    if (retriesAi(result)) throw new Error(`Digest ${result.reason}`);

    return { writes: [setDigestFailure(ports.db, job.itemId, true)] };
  }

  return publishing(ports.db, item, result.result, result.taskId, {
    executor: "model",
    provider: result.provider,
    model: result.model,
    version: catalog.version,
    staleRequeues: job.staleRequeues,
  });
}

function lostClaim(db: Database): JobOutcome {
  return { writes: [insertGuard(db, sql`0`)] };
}

type DigestSource =
  | { readonly executor: "caller" }
  | {
      readonly executor: "model";
      readonly provider: string;
      readonly model: string;
      readonly version: number;
      readonly staleRequeues: number;
    };

function publishing(
  db: Database,
  item: Readonly<DigestInput>,
  digest: Readonly<Digest>,
  taskId: number,
  source: DigestSource,
): JobOutcome {
  const entries = catalogEntries(digest);
  const { catalog, provider, model } = digestOrigin(source, entries);
  const generation = generationCurrent(item);

  const stored = {
    itemId: item.id,
    digest: JSON.stringify(digest),
    title: digest.title,
    topic: digest.topic,
    taskId,
    provider,
    model,
    generation: item.generation,
    createdAt: Date.now(),
  };

  return {
    currency: currency(db, sql`${generation} and ${catalog}`, taskId),
    writes: [
      insertGuard(db, generation),
      insertGuard(db, catalog),
      ...linkingDigest(db, item.id, entries),
      db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
      ...digestPartWrites(db, eq(items.id, item.id)),
      completedAiTask(db, { taskId, result: digest }),
      db.update(items).set({ pendingDigest: null }).where(eq(items.id, item.id)),
      setDigestFailure(db, item.id, false),
    ],
  };
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
  const eligible =
    and(
      sql`${scope}`,
      or(isNotNull(items.postText), isNotNull(items.postTextKey)),
      notExists(hasOpenJob("digest")),
    ) ?? sql`0`;

  return { eligible, job: opening(db, { kind: "digest", address, now, where: eligible }) };
}

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await linkOlderDigests(db);
}

function digestOrigin(source: DigestSource, entries: Readonly<ReturnType<typeof catalogEntries>>) {
  switch (source.executor) {
    case "caller":
      return { catalog: sql`1`, provider: null, model: null };
    case "model":
      return {
        catalog:
          source.staleRequeues >= MAX_STALE_REQUEUES
            ? sql`1`
            : catalogCurrent(source.version, entries),
        provider: source.provider,
        model: source.model,
      };
    default: {
      const exhaustive: never = source;

      return exhaustive;
    }
  }
}

export function providerSet() {
  return sql`exists (select 1 from ${settings} where ${settings.id} = 1)`;
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
