import { sql } from "drizzle-orm";

import { ITEM_FILES_ROOT } from "../../../core/contract/file-keys.ts";
import { items, media } from "../../../core/kernel/schema.ts";

export const NAMED_FILES = sql`(select ${media.fileKey} as key, ${media.itemId} as owner from ${media} where ${media.fileKey} is not null union select ${items.postTextKey}, ${items.id} from ${items} where ${items.postTextKey} is not null)`;

const FOLDER = sql.raw(`'${ITEM_FILES_ROOT}'`);

export const EMBEDDED_JOB_ID = sql`(select coalesce(max(cast(substr(n, instr(n, '-') + 1) as integer)), 0) from (select substr(named.key, length(${FOLDER} || named.owner || '/') + 1) as n from ${NAMED_FILES} as named where named.key like ${sql.raw(`'${ITEM_FILES_ROOT}%'`)}))`;
