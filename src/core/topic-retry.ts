import { startOverview } from "./overview-start.ts";
import type { Ports } from "./ports.ts";
import type { Overview } from "./topic-overview-contract.ts";
import { overviewRetried, readTopicOverview } from "./topic-overview-run.ts";
import { type TopicRow, topicOfKey } from "./topic-page.ts";

type OverviewRetry =
  | { readonly outcome: "started"; readonly overview: Overview }
  | { readonly outcome: "unknown-topic" | "no-provider" | "no-items" };

async function retryingTopic(ports: Ports, topic: Readonly<TopicRow>): Promise<OverviewRetry> {
  const { db } = ports;
  const result = await startOverview(ports, topic.id);

  if (result === "no-provider" || result === "no-items") return { outcome: result };

  if (result === "stale") return retryingTopic(ports, topic);

  if (result === "open") {
    await overviewRetried(db, topic.id);
  }

  return { outcome: "started", overview: (await readTopicOverview(db, topic.id)).overview };
}

export async function retryOverview(ports: Ports, keyText: string): Promise<OverviewRetry> {
  const topic = await topicOfKey(ports.db, keyText);

  return topic === null ? { outcome: "unknown-topic" } : retryingTopic(ports, topic);
}
