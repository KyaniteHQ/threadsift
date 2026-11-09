import { sql } from "drizzle-orm";

import { items, media } from "./schema.ts";

const FIRST_STORED = sql`from ${media} where ${media.itemId} = ${items.id} and ${media.outcome} = 'stored' order by ${media.position} limit 1`;

export const IMAGE_VIEW_COLUMNS = {
  imageKey: sql<string | null>`(select ${media.fileKey} ${FIRST_STORED})`.as("image_key"),
  imageAlt: sql<string | null>`(select ${media.alt} ${FIRST_STORED})`.as("image_alt"),
};
