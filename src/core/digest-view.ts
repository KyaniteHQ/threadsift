import { sql } from "drizzle-orm";

import { hasDigestSource } from "./digest-source.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { DIGEST_OUTCOMES } from "./kinds.ts";
import { digests, items, topics } from "./schema.ts";

export const DIGEST_VIEW_COLUMNS = {
  digestTitle: sql<string | null>`${digests.title}`.as("digest_title"),
  digestTopic: sql<
    string | null
  >`coalesce((select ${topics.name} from ${topics} where ${topics.id} = ${items.topicId}), ${digests.topic})`.as(
    "digest_topic",
  ),
  digestOutcome: sql<
    (typeof DIGEST_OUTCOMES)[number]
  >`case when exists ${hasOpenJob("digest")} then 'pending' when ${items.digestFailed} then 'failed' else 'none' end`.as(
    "digest_outcome",
  ),
  digestSource: sql<boolean>`${hasDigestSource()}`.mapWith(Boolean).as("digest_source"),
};
