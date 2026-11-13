import { startOverview } from "./overview-start.ts";
import type { Ports } from "./ports.ts";
import type { Overview } from "./topic-overview-contract.ts";
import { overviewRetried } from "./topic-overview-run.ts";
import { type TopicRow, readTopicOverview, topicOfKey } from "./topic-page.ts";

type OverviewRetry =
  | { readonly outcome: "started"; readonly overview: Overview }
  | { readonly outcome: "unknown-topic" | "no-provider" | "no-items" };

async function retryingTopic(ports: Ports, topic: Readonly<TopicRow>): Promise<OverviewRetry> {
  const { db } = ports;
  const result = await startOverview(ports, topic.id);

  switch (result.kind) {
    case "no-provider":
    case "no-items":
      return { outcome: result.kind };
    case "stale":
      return retryingTopic(ports, topic);
    case "open":
      await overviewRetried(db, topic.id, result.jobId);
      break;
    case "started":
      break;
    default: {
      const exhaustive: never = result;
      throw new Error(JSON.stringify(exhaustive));
    }
  }

  return { outcome: "started", overview: (await readTopicOverview(db, topic.id)).overview };
}

export async function retryOverview(ports: Ports, keyText: string): Promise<OverviewRetry> {
  const topic = await topicOfKey(ports.db, keyText);

  return topic === null ? { outcome: "unknown-topic" } : retryingTopic(ports, topic);
}
