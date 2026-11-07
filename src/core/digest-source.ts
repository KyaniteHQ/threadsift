import { type SQLWrapper, and, eq, exists, isNotNull, or, sql } from "drizzle-orm";

import { DIGEST_INPUT_BYTES, cutDigestInput } from "./ai-contract.ts";
import { failedAiTask } from "./ai-tasks.ts";
import { logFailure } from "./failure-log.ts";
import {
  type ClaimedJob,
  type JobCurrency,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
} from "./job-outcome.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { readPostText } from "./post-text.ts";
import { eligibleComments } from "./reddit-thread.ts";
import { insertGuard, items } from "./schema.ts";

export function digestInput(db: Database, id: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      source: items.source,
      generation: items.generation,
      pendingDigest: items.pendingDigest,
      postTextKey: items.postTextKey,
      postText: sql<string | null>`substr(${items.postText}, 1, ${DIGEST_INPUT_BYTES})`,
      hasComments: sql<boolean>`${eligibleComments()}`.mapWith(Boolean),
    })
    .from(items)
    .where(eq(items.id, id));
}

export function hasDigestSource() {
  return or(isNotNull(items.postText), isNotNull(items.postTextKey), eligibleComments()) ?? sql`0`;
}

export type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

export function setDigestFailure(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  failed: boolean,
  condition: Readonly<SQLWrapper> = exists(hasOpenJob("digest")),
) {
  return db
    .update(items)
    .set({ digestFailed: failed })
    .where(and(eq(items.id, itemId), sql`${condition}`));
}

export function generationCurrent(
  item: Readonly<Pick<DigestInput, "id" | "generation" | "pendingDigest">>,
) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${item.id} and ${items.generation} = ${item.generation} and ${items.pendingDigest} is ${item.pendingDigest} and not exists ${hasOpenJob("fetch")})`;
}

export function currency(
  db: Database,
  current: Readonly<SQLWrapper>,
  taskId: number | null,
): JobCurrency {
  return {
    current: async () => {
      const [row] = await db.select({ current: sql<number>`${current}` }).from(sql`(select 1)`);

      return row?.current === 1;
    },
    discard: (cause) =>
      taskId === null
        ? undefined
        : failedAiTask(db, taskId, {
            reason: cause === "error" ? "unreachable" : cause,
            status: null,
          }),
  };
}

class PostTextUnreadable extends Error {}

async function unreadableText(
  db: Database,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const generation = generationCurrent(item);
  const read = currency(db, generation, null);

  if (!(await read.current())) return { currency: read, writes: [insertGuard(db, generation)] };

  if (!isLastAttempt(job.attempts))
    throw new PostTextUnreadable(`The post text file of Item ${item.id} cannot be read`);

  return {
    currency: read,
    failedAttempt: true,
    writes: [insertGuard(db, generation), setDigestFailure(db, item.id, true)],
  };
}

export type DigestText = { readonly text: string | null } | { readonly outcome: JobOutcome };

export async function readDigestText(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<DigestText> {
  if (item.postTextKey === null) return { text: item.postText };

  let text: string | null;

  try {
    text = await readPostText(ports.files, item.id, item.postTextKey);
  } catch (error) {
    logFailure("post-text-not-read", { itemId: item.id }, error);
    text = null;
  }

  return text === null
    ? { outcome: await unreadableText(ports.db, job, item) }
    : { text: cutDigestInput(text) };
}
