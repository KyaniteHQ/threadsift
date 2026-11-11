import { eq, desc } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import { guardHolds } from "./guards.ts";
import { enqueueRows } from "./job-rows.ts";
import type { Database, Ports } from "./ports.ts";
import { digests, items, topicPages } from "./schema.ts";
import type { Overview } from "./topic-overview-contract.ts";
import { openingOverview } from "./topic-overview-open.ts";
import { type TopicRow, readTopicOverview, topicOfKey } from "./topic-page.ts";

type OverviewRetry =
  | { readonly outcome: "started"; readonly overview: Overview }
  | { readonly outcome: "unknown-topic" | "no-provider" | "no-items" };

async function newestItemOf(db: Database, topic: Readonly<TopicRow>): Promise<number | undefined> {
  const [newest] = await db
    .select({ id: items.id })
    .from(items)
    .innerJoin(digests, eq(digests.itemId, items.id))
    .where(eq(items.topicId, topic.id))
    .orderBy(desc(items.savedAt), desc(items.id))
    .limit(1);

  return newest?.id;
}

export async function retryOverview(ports: Ports, keyText: string): Promise<OverviewRetry> {
  const { db } = ports;
  const topic = await topicOfKey(db, keyText);

  if (topic === null) return { outcome: "unknown-topic" };

  if (!(await guardHolds(db, providerSet()))) return { outcome: "no-provider" };

  const owner = await newestItemOf(db, topic);

  if (owner === undefined) return { outcome: "no-items" };

  const [, queued] = await db.batch([
    db.update(topicPages).set({ failure: null }).where(eq(topicPages.topicId, topic.id)),
    openingOverview(db, owner),
  ]);

  await enqueueRows(ports, queued);

  return { outcome: "started", overview: (await readTopicOverview(db, topic.id)).overview };
}
