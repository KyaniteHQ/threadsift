import { sql } from "drizzle-orm";

import { providerSet } from "./ai-tasks.ts";
import { newestOwner, startOverview } from "./overview-start.ts";
import type { Ports } from "./ports.ts";
import { hasOpenOverview } from "./topic-coverage.ts";
import type { Overview } from "./topic-overview-contract.ts";
import { type TopicRow, readTopicOverview, topicOfKey } from "./topic-page.ts";

type OverviewRetry =
  | { readonly outcome: "started"; readonly overview: Overview }
  | { readonly outcome: "unknown-topic" | "no-provider" | "no-items" };

async function retryingTopic(ports: Ports, topic: Readonly<TopicRow>): Promise<OverviewRetry> {
  const { db } = ports;

  if (!(await startOverview(ports, topic.id))) {
    const [facts] = await db
      .select({
        provider: sql<number>`${providerSet()}`,
        owner: sql<number | null>`${newestOwner(topic.id)}`,
        open: sql<number>`${hasOpenOverview(topic.id)}`,
      })
      .from(sql`(select 1)`);

    if (facts?.provider !== 1) return { outcome: "no-provider" };

    if (facts.owner === null) return { outcome: "no-items" };

    if (facts.open !== 1) return retryingTopic(ports, topic);
  }

  return { outcome: "started", overview: (await readTopicOverview(db, topic.id)).overview };
}

export async function retryOverview(ports: Ports, keyText: string): Promise<OverviewRetry> {
  const topic = await topicOfKey(ports.db, keyText);

  return topic === null ? { outcome: "unknown-topic" } : retryingTopic(ports, topic);
}
