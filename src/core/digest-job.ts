import { and, eq, sql } from "drizzle-orm";

import { AI_DEADLINE_MS, DIGEST_INPUT_BYTES, type Digest, retriesAi } from "./ai-contract.ts";
import { TASKS, type DoneTask, completedAiTask, failedAiTask, runAiTask } from "./ai-tasks.ts";
import type { JobCurrency, JobHandler, JobOutcome, JobPorts } from "./job-outcome.ts";
import { setDigestFailure } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { type JobRow, digests, guards, items } from "./schema.ts";

function digestInput(db: Database, id: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      source: items.source,
      generation: items.generation,
      postText: sql<string | null>`substr(${items.postText}, 1, ${DIGEST_INPUT_BYTES})`,
    })
    .from(items)
    .where(eq(items.id, id));
}

type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

async function attemptDigest(ports: JobPorts, job: Readonly<JobRow>): Promise<JobOutcome> {
  const [item] = await digestInput(ports.db, job.itemId);

  if (item === undefined || item.postText === null)
    return { kind: "finish", writes: [setDigestFailure(ports.db, job.itemId, false)] };

  const result = await runAiTask(ports, TASKS.digest, {
    text: JSON.stringify({ title: item.title, source: item.source, postText: item.postText }),
    inputRevision: item.generation,
    attempts: job.attempts + 1,
  });

  if (result.kind !== "done") {
    if (retriesAi(result)) throw new Error(`Digest ${result.reason}`);

    return { kind: "finish", writes: [setDigestFailure(ports.db, job.itemId, true)] };
  }

  return publishing(ports.db, item, result);
}

function currency(
  db: Database,
  { id, generation }: Readonly<Pick<DigestInput, "id" | "generation">>,
  taskId: number,
): JobCurrency {
  return {
    current: async () => {
      const [current] = await db
        .select({ generation: items.generation })
        .from(items)
        .where(eq(items.id, id));

      return current?.generation === generation;
    },
    discard: (cause) =>
      failedAiTask(db, taskId, { reason: cause === "error" ? "unreachable" : cause, status: null }),
  };
}

function publishing(
  db: Database,
  item: Readonly<DigestInput>,
  result: DoneTask<Digest>,
): JobOutcome {
  const stored = {
    itemId: item.id,
    digest: JSON.stringify(result.result),
    title: result.result.title,
    topic: result.result.topic,
    taskId: result.taskId,
    provider: result.provider,
    model: result.model,
    generation: item.generation,
    createdAt: Date.now(),
  };

  return {
    kind: "finish",
    currency: currency(db, item, result.taskId),
    writes: [
      db.insert(guards).select(
        db
          .select({ ok: sql<number>`count(*)`.as("ok") })
          .from(items)
          .where(and(eq(items.id, item.id), eq(items.generation, item.generation))),
      ),
      db.insert(digests).values(stored).onConflictDoUpdate({ target: digests.itemId, set: stored }),
      completedAiTask(db, result),
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
