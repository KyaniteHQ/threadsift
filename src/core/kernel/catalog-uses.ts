import { sql } from "drizzle-orm";

import { providerMayRead } from "./digest-source.ts";
import { items, itemTags, tags, topics } from "./schema.ts";

export const TOPIC_USES = sql<number>`(select count(*) from ${items} where ${items.topicId} = ${topics.id})`;

export const TAG_USES = sql<number>`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id})`;

export const READABLE_TOPIC_USES = sql<number>`(select count(*) from ${items} where ${items.topicId} = ${topics.id} and ${providerMayRead(items.id)})`;

export const READABLE_TAG_USES = sql<number>`(select count(*) from ${itemTags} where ${itemTags.tagId} = ${tags.id} and ${providerMayRead(itemTags.itemId)})`;
