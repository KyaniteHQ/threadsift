import { type SQLWrapper, and, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

import { failedAiTask } from "./ai-tasks.ts";
import {
  type CatalogNames,
  type CommentCounts,
  type DigestPrompt,
  DIGEST_INPUT_BYTES,
  type LinkedPage,
  digestPrompt,
} from "./digest-prompt.ts";
import { report } from "./failure-log.ts";
import { type JobCurrency, type JobOutcome } from "./job-outcome.ts";
import { hasOpenJob, opening } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { providerSet } from "./provider-saved.ts";
import { candidateLink, commentCandidates, eligibleComments } from "./reddit-thread.ts";
import { type JobRow, digests, insertGuard, items } from "./schema.ts";

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

export function unusableInput(db: Database, itemId: number) {
  return [
    ...keptNotUpdated(db, itemId),
    setMarker(db, itemId, true, and(whileDigestOpen(), providerSet()) ?? sql`0`),
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

export async function staleOutcome(
  db: Database,
  item: Readonly<DigestInput>,
): Promise<JobOutcome | null> {
  const generation = generationCurrent(item);
  const read = currency(db, generation, null);

  return (await read.current()) ? null : { currency: read, writes: [insertGuard(db, generation)] };
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
  report("digest-comments-submitted", {
    taskId,
    itemId: item.id,
    generation: item.generation,
    ...counts,
  });
}

export function attemptGenerationCurrent(
  job: Readonly<Pick<JobRow, "itemId" | "attemptGeneration">>,
) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${job.itemId} and ${items.generation} is ${job.attemptGeneration})`;
}

export function lostClaim(db: Database): JobOutcome {
  return { writes: [insertGuard(db, sql`0`)] };
}
