import { type SQLWrapper, and, eq, exists, isNotNull, ne, notExists, or, sql } from "drizzle-orm";

import {
  AI_DEADLINE_MS,
  DIGEST_INPUT_BYTES,
  cutDigestInput,
  parseStoredDigest,
  digestPrompt,
  type Digest,
  retriesAi,
} from "./ai-contract.ts";
import {
  TASKS,
  startCallerTask,
  completedAiTask,
  failedAiTask,
  runAiTask,
  expireAiTasks,
} from "./ai-tasks.ts";
import {
  catalogEntries,
  catalogCurrent,
  linkingDigest,
  readCatalog,
  linkOlderDigests,
} from "./catalog.ts";
import {
  MAX_STALE_REQUEUES,
  type JobCurrency,
  type JobHandler,
  type JobOutcome,
  type JobPorts,
} from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { readPostText } from "./post-text.ts";
import { type JobRow, digests, insertGuard, items, settings } from "./schema.ts";
import { digestPartWrites } from "./search.ts";

function digestInput(db: Database, id: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      source: items.source,
      generation: items.generation,
      pendingDigest: items.pendingDigest,
      postTextKey: items.postTextKey,
      postText: sql<string | null>`substr(${items.postText}, 1, ${DIGEST_INPUT_BYTES})`,
    })
    .from(items)
    .where(eq(items.id, id));
}

type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

async function startOfFiledText(
  ports: JobPorts,
  { id, postTextKey }: Readonly<{ id: number; postTextKey: string }>,
): Promise<string> {
  const text = await readPostText(ports.files, id, postTextKey);

  if (text === null) throw new Error(`The post text file of Item ${id} cannot be read`);

  return cutDigestInput(text);
}

async function attemptDigest(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const [item] = await digestInput(ports.db, job.itemId);

  if (item === undefined || (item.postText === null && item.postTextKey === null))
    return { writes: [setDigestFailure(ports.db, job.itemId, false)] };

  if (item.pendingDigest !== null) {
    const digest = parseStoredDigest(item.pendingDigest);

    const taskId = await startCallerTask(ports, item.pendingDigest, {
      inputRevision: item.generation,
      attempts: job.attempts + 1,
    });

    return publishing(ports.db, item, digest, taskId, { executor: "caller" });
  }

  const postText =
    item.postTextKey === null
      ? item.postText
      : await startOfFiledText(ports, { id: item.id, postTextKey: item.postTextKey });

  const catalog = await readCatalog(ports.db);

  const result = await runAiTask(ports, TASKS.digest, {
    text: digestPrompt(
      JSON.stringify({ title: item.title, source: item.source, postText }),
      catalog,
    ),
    inputRevision: item.generation,
    attempts: job.attempts + 1,
  });

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

type DigestSource =
  | { readonly executor: "caller" }
  | {
      readonly executor: "model";
      readonly provider: string;
      readonly model: string;
      readonly version: number;
      readonly staleRequeues: number;
    };

function generationCurrent(
  item: Readonly<Pick<DigestInput, "id" | "generation" | "pendingDigest">>,
) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${item.id} and ${items.generation} = ${item.generation} and ${items.pendingDigest} is ${item.pendingDigest} and not exists ${hasOpenJob("fetch")})`;
}

function currency(db: Database, current: Readonly<SQLWrapper>, taskId: number): JobCurrency {
  return {
    current: async () => {
      const [row] = await db.select({ current: sql<number>`${current}` }).from(sql`(select 1)`);

      return row?.current === 1;
    },
    discard: (cause) =>
      failedAiTask(db, taskId, { reason: cause === "error" ? "unreachable" : cause, status: null }),
  };
}

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

export function setDigestFailure(
  db: Database,
  itemId: number,
  failed: boolean,
  condition: Readonly<SQLWrapper> = exists(hasOpenJob("digest")),
) {
  return db
    .update(items)
    .set({ digestFailed: failed })
    .where(and(eq(items.id, itemId), sql`${condition}`));
}

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
