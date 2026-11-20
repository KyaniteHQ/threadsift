import { eq } from "drizzle-orm";

import { catalogKey } from "./catalog-key.ts";
import type { Database } from "./database.ts";
import type { Side } from "./merge-unit.ts";
import { survivorOf } from "./pins.ts";
import { topics } from "./schema.ts";
import { topicKeyOfSegment } from "./topic-path.ts";

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
