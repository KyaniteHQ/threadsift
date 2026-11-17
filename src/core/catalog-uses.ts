import { sql } from "drizzle-orm";

import { items, itemTags, tags, topics } from "./schema.ts";

export const TOPIC_USES = sql<number>`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`;

export const TAG_USES = sql<number>`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id})`;
