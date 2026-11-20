import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { storedTaskIs } from "./digest-stored.ts";
import { items, pins } from "./schema.ts";

export function currentDisagreementPin(): SQL {
  return sql`${pins.kind} = 'items-disagree' and ${storedTaskIs(pins.fromItemId, pins.fromDigest)} and ${storedTaskIs(pins.intoItemId, pins.intoDigest)}`;
}

export function disagreementInTopic(topicId: number | Readonly<SQLWrapper>) {
  return sql`${currentDisagreementPin()} and (select count(*) from ${items} where ${items.id} in (${pins.fromItemId}, ${pins.intoItemId}) and ${items.topicId} = ${topicId}) = 2`;
}
