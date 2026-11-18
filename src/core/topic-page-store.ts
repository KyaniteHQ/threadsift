import { eq, sql } from "drizzle-orm";

import { loggedOverview } from "./log-writes.ts";
import type { Database } from "./ports.ts";
import { topicPages, topics } from "./schema.ts";
import { overviewLine } from "./topic-overview-contract.ts";
import type { OverviewBasis, OverviewSent } from "./topic-overview-input.ts";
import { continuingOverview, overviewStored } from "./topic-overview-run.ts";
import { queueVaultIndex, queueVaultTopics } from "./vault-queue.ts";

function revisedPage(
  topicId: number,
  read: Readonly<OverviewBasis>,
  prompt: Readonly<OverviewSent>,
  overview: string | null,
) {
  const gone = new Set(read.removed);
  const replaced = new Set(prompt.included.map(({ id }) => id));

  const kept =
    prompt.current === null
      ? []
      : (read.page?.builtFrom ?? []).filter(({ item }) => !gone.has(item) && !replaced.has(item));

  return {
    topicId,
    overview,
    revision: (read.page?.revision ?? 0) + 1,
    builtFrom: [...kept, ...prompt.included.map(({ id, digest }) => ({ item: id, digest }))],
  };
}

export async function storedPage(
  db: Database,
  {
    topicId,
    read,
    prompt,
    overview,
  }: Readonly<{
    topicId: number;
    read: Readonly<OverviewBasis>;
    prompt: Readonly<OverviewSent>;
    overview: string | null;
  }>,
) {
  const [page] = await db
    .select({ overview: topicPages.overview })
    .from(topicPages)
    .where(eq(topicPages.topicId, topicId));
  const previous = page?.overview ?? null;

  return {
    writes: [
      overviewStored(db, revisedPage(topicId, read, prompt, overview)),
      ...loggedOverview(db, topicId, {
        added: prompt.included.length,
        removed: read.removed.length,
      }),
      ...(overview === previous ? [] : [queueVaultTopics(db, eq(topics.id, topicId))]),
      ...((overview === null ? null : overviewLine(overview)) ===
      (previous === null ? null : overviewLine(previous))
        ? []
        : [queueVaultIndex(db, sql`1`)]),
    ],
    continuation: [continuingOverview(db, topicId, sql`1`)],
  };
}
