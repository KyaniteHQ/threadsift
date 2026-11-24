import { eq, sql } from "drizzle-orm";

import { AI_INPUT_BYTES } from "../../../core/contract/ai-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { candidateLink, hasDigestContent } from "../../../core/kernel/digest-source.ts";
import { guardedOutcome } from "../../../core/kernel/guarded-outcome.ts";
import type { JobOutcome } from "../../../core/kernel/job-outcome.ts";
import { hasOpenJob } from "../../../core/kernel/job-rows.ts";
import { items } from "../../../core/kernel/schema.ts";

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
      postText: sql<string | null>`substr(${items.postText}, 1, ${AI_INPUT_BYTES})`,
      hasContent: sql<boolean>`${hasDigestContent()}`.mapWith(Boolean),
    })
    .from(items)
    .where(eq(items.id, id));
}

export function lacksPendingDigest(db: Database, id: number) {
  return db
    .select({ lacksPending: sql<boolean>`${items.pendingDigest} is null`.mapWith(Boolean) })
    .from(items)
    .where(eq(items.id, id));
}

export type DigestInput = Awaited<ReturnType<typeof digestInput>>[number];

export const DIGEST_INPUT = {
  key: items.id,
  version: items.generation,
  pending: items.pendingDigest,
};

export function generationCurrent(
  item: Readonly<Pick<DigestInput, "id" | "generation" | "pendingDigest">>,
) {
  return sql`exists (select 1 from ${items} where ${items.id} = ${item.id} and ${items.generation} = ${item.generation} and ${items.pendingDigest} is ${item.pendingDigest} and not exists ${hasOpenJob("fetch")})`;
}

export async function staleOutcome(
  db: Database,
  item: Readonly<DigestInput>,
): Promise<JobOutcome | null> {
  const outcome = guardedOutcome(db, generationCurrent(item));

  return (await outcome.currency.current()) ? null : outcome;
}
