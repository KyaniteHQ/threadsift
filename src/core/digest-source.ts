import { type SQLWrapper, and, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

import { failedAiTask, providerSet } from "./ai-tasks.ts";
import {
  type CatalogNames,
  type CommentCounts,
  type DigestPrompt,
  DIGEST_INPUT_BYTES,
  type LinkedPage,
  cutDigestInput,
  digestPrompt,
} from "./digest-prompt.ts";
import { logFailure } from "./failure-log.ts";
import {
  type ClaimedJob,
  type JobCurrency,
  type JobOutcome,
  type JobPorts,
  isLastAttempt,
} from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { readPostText } from "./post-text.ts";
import { candidateLink, commentCandidates, eligibleComments } from "./reddit-thread.ts";
import { digests, insertGuard, items } from "./schema.ts";

export function openingPick(db: Database, itemId: number) {
  return opening(db, {
    kind: "related_pick",
    address: sql`${items.originalUrl}`,
    now: Date.now(),
    where: and(eq(items.id, itemId), providerSet()) ?? sql`0`,
  });
}

export function digestInput(db: Database, id: number) {
  return db
    .select({
      id: items.id,
      title: items.title,
      source: items.source,
      generation: items.generation,
      pendingDigest: items.pendingDigest,
      linkedUrl: candidateLink(),
      postTextKey: items.postTextKey,
      postText: sql<string | null>`substr(${items.postText}, 1, ${DIGEST_INPUT_BYTES})`,
      hasComments: sql<boolean>`${eligibleComments()}`.mapWith(Boolean),
    })
    .from(items)
    .where(eq(items.id, id));
}

function hasCandidateLink() {
  return and(isNull(items.pendingDigest), isNotNull(candidateLink())) ?? sql`0`;
}

export function hasDigestSource() {
  return (
    or(
      isNotNull(items.postText),
      isNotNull(items.postTextKey),
      eligibleComments(),
      hasCandidateLink(),
    ) ?? sql`0`
  );
}

export type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

function setMarker(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  failed: boolean,
  condition: Readonly<SQLWrapper>,
) {
  return db
    .update(items)
    .set({ digestFailed: failed })
    .where(and(eq(items.id, itemId), sql`${condition}`));
}

function whileDigestOpen() {
  return exists(hasOpenJob("digest"));
}

export function markDigest(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  mark: "cleared" | "attempt-failed",
) {
  return setMarker(db, itemId, mark === "attempt-failed", whileDigestOpen());
}

export function keptNotUpdated(
  db: Database,
  itemId: number | Readonly<SQLWrapper>,
  when: Readonly<SQLWrapper> = sql`1`,
) {
  const kept = exists(
    db.select({ id: digests.itemId }).from(digests).where(eq(digests.itemId, items.id)),
  );

  return [
    markDigest(db, itemId, "cleared"),
    setMarker(db, itemId, true, and(kept, sql`${when}`) ?? sql`0`),
  ] as const;
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
  alsoOnDiscard: ReturnType<JobCurrency["discard"]> = [],
): JobCurrency {
  return {
    current: async () => {
      const [row] = await db.select({ current: sql<number>`${current}` }).from(sql`(select 1)`);

      return row?.current === 1;
    },
    discard: (cause) => [
      ...(taskId === null
        ? []
        : [
            failedAiTask(db, taskId, {
              reason: cause === "error" ? "unreachable" : cause,
              status: null,
            }),
          ]),
      ...alsoOnDiscard,
    ],
  };
}

class PostTextUnreadable extends Error {}

export async function staleOutcome(
  db: Database,
  item: Readonly<DigestInput>,
): Promise<JobOutcome | null> {
  const generation = generationCurrent(item);
  const read = currency(db, generation, null);

  return (await read.current()) ? null : { currency: read, writes: [insertGuard(db, generation)] };
}

async function unreadableText(
  db: Database,
  job: Readonly<ClaimedJob>,
  item: Readonly<DigestInput>,
): Promise<JobOutcome> {
  const stale = await staleOutcome(db, item);

  if (stale !== null) return stale;

  const generation = generationCurrent(item);
  const read = currency(db, generation, null);

  if (!isLastAttempt(job.attempts))
    throw new PostTextUnreadable(`The post text file of Item ${item.id} cannot be read`);

  return {
    currency: read,
    failedAttempt: true,
    writes: [insertGuard(db, generation), markDigest(db, item.id, "attempt-failed")],
  };
}

export async function modelInput(
  db: Database,
  item: Readonly<DigestInput>,
  postText: string | null,
  catalog: Readonly<CatalogNames>,
  page: Readonly<LinkedPage> | null,
): Promise<DigestPrompt> {
  const comments =
    item.source === "reddit" || item.source === "x"
      ? await commentCandidates(db, { itemId: item.id, generation: item.generation })
      : [];

  return digestPrompt(
    { title: item.title, source: item.source, postText },
    comments,
    catalog,
    page,
  );
}

export function logSubmission(
  taskId: number,
  item: Readonly<DigestInput>,
  counts: Readonly<CommentCounts>,
): void {
  console.warn(
    JSON.stringify({
      event: "digest-comments-submitted",
      taskId,
      itemId: item.id,
      generation: item.generation,
      ...counts,
    }),
  );
}

export function refusedInput(
  db: Database,
  item: Readonly<DigestInput>,
  fixedBytes: number,
): JobOutcome {
  const generation = generationCurrent(item);

  console.warn(
    JSON.stringify({
      event: "digest-input-refused",
      itemId: item.id,
      reason: "fixed-metadata-over-cap",
      fixedBytes,
    }),
  );

  return {
    currency: currency(db, generation, null),
    writes: [insertGuard(db, generation), markDigest(db, item.id, "attempt-failed")],
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
