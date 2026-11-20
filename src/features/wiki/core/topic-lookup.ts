import { eq } from "drizzle-orm";

import { catalogKey } from "../../../core/contract/catalog-key.ts";
import { topicKeyOfSegment } from "../../../core/contract/topic-path.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { topics } from "../../../core/kernel/schema.ts";
import type { Side } from "./merge-unit.ts";
import { survivorOf } from "./pins.ts";

export async function topicOfKey(db: Database, text: string): Promise<Side | null> {
  const key = catalogKey(topicKeyOfSegment(text));

  if (key === "") return null;

  const [topic] = await db
    .select({ id: topics.id, key: topics.key, name: topics.name })
    .from(topics)
    .where(eq(topics.key, key));

  if (topic !== undefined) return topic;

  return survivorOf(db, "topic-merge", key);
}
