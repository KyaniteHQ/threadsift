import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { digests, pins } from "./schema.ts";

export function currentDisagreementPin(): SQL {
  return sql`${pins.kind} = 'items-disagree' and ${pins.fromDigest} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${pins.fromItemId}) and ${pins.intoDigest} = (select ${digests.taskId} from ${digests} where ${digests.itemId} = ${pins.intoItemId})`;
}

export function pairPinned(first: Readonly<SQLWrapper>, second: Readonly<SQLWrapper>): SQL {
  return sql`exists (select 1 from ${pins} where ${currentDisagreementPin()} and ${pins.fromItemId} = min(${first}, ${second}) and ${pins.intoItemId} = max(${first}, ${second}))`;
}
