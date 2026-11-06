import { type SQLWrapper, and, eq, exists, isNotNull, notExists, sql } from "drizzle-orm";

import {
  AI_DEADLINE_MS,
  DIGEST_INPUT_BYTES,
  DigestSchema,
  digestPrompt,
  type Digest,
  retriesAi,
} from "./ai-contract.ts";
import {
  TASKS,
  type DoneTask,
  completedAiTask,
  failedAiTask,
  runAiTask,
  expireAiTasks,
} from "./ai-tasks.ts";
import { catalogCurrent, linkingDigest, readCatalog, linkOlderDigests } from "./catalog.ts";
import type { JobCurrency, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import { DIGEST_OUTCOMES } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { type JobRow, aiTasks, digests, guards, items, topics } from "./schema.ts";

function digestInput(db: Database, id: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      source: items.source,
      generation: items.generation,
      pendingDigest: items.pendingDigest,
      postText: sql<string | null>`substr(${items.postText}, 1, ${DIGEST_INPUT_BYTES})`,
    })
    .from(items)
    .where(eq(items.id, id));
}

type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

async function attemptDigest(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const [item] = await digestInput(ports.db, job.itemId);

  if (item === undefined || item.postText === null)
    return { writes: [setDigestFailure(ports.db, job.itemId, false)] };

  if (item.pendingDigest !== null) {
    const digest = DigestSchema.parse(JSON.parse(item.pendingDigest));

    return publishing(
      ports.db,
      item,
      { kind: "done", result: digest, taskId: null, provider: null, model: null },
      null,
    );
  }

  const catalog = await readCatalog(ports.db);

  const result = await runAiTask(ports, TASKS.digest, {
    text: digestPrompt(
      JSON.stringify({ title: item.title, source: item.source, postText: item.postText }),
      catalog,
    ),
    inputRevision: item.generation,
    attempts: job.attempts + 1,
  });

  if (result.kind !== "done") {
    if (retriesAi(result)) throw new Error(`Digest ${result.reason}`);

    return { writes: [setDigestFailure(ports.db, job.itemId, true)] };
  }

  return publishing(ports.db, item, result, catalog.version);
}

function currency(
  db: Database,
  {
    id,
    generation,
    pendingDigest,
  }: Readonly<Pick<DigestInput, "id" | "generation" | "pendingDigest">>,
  taskId: number | null,
  catalog: Readonly<{ version: number; digest: Digest }> | null,
): JobCurrency {
  return {
    current: async () => {
      const [current] = await db
        .select({
          generation: items.generation,
          pendingDigest: items.pendingDigest,
          fetching: sql<boolean>`exists ${hasOpenJob("fetch")}`,
          catalogMatches:
            catalog === null
              ? sql<boolean>`1`
              : sql<boolean>`${catalogCurrent(catalog.version, catalog.digest)}`,
        })
        .from(items)
        .where(eq(items.id, id));

      if (
        current?.generation !== generation ||
        current.pendingDigest !== pendingDigest ||
        current.fetching
      )
        return "generation";

      return current.catalogMatches ? "current" : "catalog";
    },
    discard: (cause) =>
      taskId === null
        ? db.delete(guards).where(sql`0`)
        : failedAiTask(db, taskId, {
            reason: cause === "error" ? "unreachable" : cause,
            status: null,
          }),
  };
}

function publishing(
  db: Database,
  item: Readonly<DigestInput>,
  result: Omit<DoneTask<Digest>, "taskId"> & { readonly taskId: number | null },
  version: number | null,
): JobOutcome {
  const taskId = result.taskId ?? sql<number>`(select max(id) from ${aiTasks})`;

  const stored = {
    itemId: item.id,
    digest: JSON.stringify(result.result),
    title: result.result.title,
    topic: result.result.topic,
    taskId,
    provider: result.provider,
    model: result.model,
    generation: item.generation,
    createdAt: Date.now(),
  };

  return {
    currency: currency(
      db,
      item,
      result.taskId,
      version === null ? null : { version, digest: result.result },
    ),
    writes: [
      generationGuard(db, item),
      ...(version === null
        ? []
        : [
            db.insert(guards).values({
              ok: sql`case when ${catalogCurrent(version, result.result)} then 1 else 0 end`,
            }),
          ]),
      ...callerTask(db, item, result),
      ...linkingDigest(db, item.id, result.result),
      db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
      ...(result.taskId === null
        ? []
        : [completedAiTask(db, { taskId: result.taskId, result: result.result })]),
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

export function setDigestFailure(db: Database, itemId: number, failed: boolean) {
  return db
    .update(items)
    .set({ digestFailed: failed })
    .where(and(eq(items.id, itemId), exists(hasOpenJob("digest"))));
}

export function openingDigest(
  db: Database,
  { itemId, address, now }: Readonly<{ itemId: number; address: string; now: number }>,
  eligible: Readonly<SQLWrapper> = sql`1`,
) {
  return opening(db, {
    kind: "digest",
    address,
    now,
    where:
      and(
        eq(items.id, itemId),
        isNotNull(items.postText),
        notExists(hasOpenJob("digest")),
        sql`${eligible}`,
      ) ?? sql`0`,
  });
}

export const EMPTY_DIGEST_VIEW = {
  digestTitle: null,
  digestTopic: null,
  digestOutcome: "none",
} as const;

export const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<
    string | null
  >`coalesce((select ${topics.name} from ${topics} where ${topics.id} = ${items.topicId}), ${digests.topic})`.as(
    "digest_topic",
  ),
  digestOutcome: sql<
    (typeof DIGEST_OUTCOMES)[number]
  >`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
    "digest_outcome",
  ),
};

export async function sweepDigests(db: Database, now: number): Promise<void> {
  await expireAiTasks(db, now);
  await linkOlderDigests(db);
}

function callerTask(
  db: Database,
  item: Readonly<DigestInput>,
  result: Readonly<Omit<DoneTask<Digest>, "taskId"> & { taskId: number | null }>,
) {
  return result.taskId === null
    ? [
        db.insert(aiTasks).values({
          kind: "digest",
          inputs: item.pendingDigest ?? "",
          inputRevision: item.generation,
          executor: "caller",
          attempts: 1,
          deadline: Date.now(),
          state: "done",
          result: JSON.stringify(result.result),
        }),
      ]
    : [];
}

function generationGuard(db: Database, item: Readonly<DigestInput>) {
  return db.insert(guards).select(
    db
      .select({ ok: sql<number>`count(*)`.as("ok") })
      .from(items)
      .where(
        and(
          eq(items.id, item.id),
          eq(items.generation, item.generation),
          sql`${items.pendingDigest} is ${item.pendingDigest}`,
          notExists(hasOpenJob("fetch")),
        ),
      ),
  );
}
