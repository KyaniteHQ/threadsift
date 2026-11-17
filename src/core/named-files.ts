import { sql } from "drizzle-orm";

import { items, media } from "./schema.ts";

export const NAMED_FILES = sql`(select ${media.fileKey} as key, ${media.itemId} as owner from ${media} where ${media.fileKey} is not null union select ${items.postTextKey}, ${items.id} from ${items} where ${items.postTextKey} is not null)`;
