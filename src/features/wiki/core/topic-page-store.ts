import { eq, sql } from "drizzle-orm";

import { overviewLine } from "../../../core/contract/topic-overview-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { wokenBotWaits } from "../../../core/kernel/job-waiting.ts";
import { loggedOverview } from "../../../core/kernel/log-writes.ts";
import { topicPages } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import type { OverviewBasis, OverviewSent } from "./topic-overview-input.ts";
import { continuingOverview, overviewStored } from "./topic-overview-run.ts";

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
      wokenBotWaits(db, { moved: { kind: "library" }, now: Date.now() }),
      ...loggedOverview(db, topicId, {
        added: prompt.included.length,
        removed: read.removed.length,
      }),
      ...(overview === previous ? [] : STALE.overviewText(db, topicId)),
      ...((overview === null ? null : overviewLine(overview)) ===
      (previous === null ? null : overviewLine(previous))
        ? []
        : STALE.overviewLine(db)),
    ],
    continuation: [continuingOverview(db, topicId, sql`1`)],
  };
}
