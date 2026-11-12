import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { DISAGREEMENT_ITEMS } from "./disagreement-task.ts";
import { digests, items, topicChecks } from "./schema.ts";
import { digestedCount } from "./topic-coverage.ts";

export function membersOf(topicId: Readonly<SQLWrapper>): SQL<string | null> {
  return sql`(select group_concat(newest.id || ':' || newest.digest, ',' order by newest.id) from (select member.id as id, kept.task_id as digest from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId} order by member.saved_at desc, member.id desc limit ${DISAGREEMENT_ITEMS}) as newest)`;
}

export function newestDigestAt(topicId: Readonly<SQLWrapper>): SQL<number> {
  return sql`(select max(kept.created_at) from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId})`;
}

export function touched(topicId: Readonly<SQLWrapper>): SQL {
  return sql`${digestedCount(topicId)} >= 2 and ${membersOf(topicId)} is not (select ${topicChecks.members} from ${topicChecks} where ${topicChecks.topicId} = ${topicId})`;
}
