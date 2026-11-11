import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { digests, items, topicPages } from "./schema.ts";

function builtFrom(topicId: number) {
  return sql`json_each(coalesce((select ${topicPages.builtFrom} from ${topicPages} where ${topicPages.topicId} = ${topicId}), '[]'))`;
}

export function notBuiltFrom(
  topicId: number,
  itemId: Readonly<SQLWrapper>,
  digestId: Readonly<SQLWrapper>,
): SQL {
  return sql`not exists (select 1 from ${builtFrom(topicId)} as built where json_extract(built.value, '$.item') = ${itemId} and json_extract(built.value, '$.digest') = ${digestId})`;
}

function removedFrom(topicId: number): SQL {
  return sql`not exists (select 1 from ${items} as member where member.id = json_extract(built.value, '$.item') and member.topic_id = ${topicId})`;
}

export function removedItemIds(topicId: number): SQL {
  return sql`select json_extract(built.value, '$.item') as id from ${builtFrom(topicId)} as built where ${removedFrom(topicId)}`;
}

export function inputsHold(
  topicId: number,
  {
    revision,
    included,
    removed,
  }: Readonly<{
    revision: number;
    included: readonly Readonly<{ id: number; digest: number }>[];
    removed: readonly number[];
  }>,
): SQL {
  const wanted = JSON.stringify(included.map(({ id, digest }) => ({ item: id, digest })));

  const revised = sql`coalesce((select ${topicPages.revision} from ${topicPages} where ${topicPages.topicId} = ${topicId}), 0) = ${revision}`;

  const includedHold = sql`(select count(*) from json_each(${wanted}) as wanted join ${items} as member on member.id = json_extract(wanted.value, '$.item') and member.topic_id = ${topicId} join ${digests} as kept on kept.item_id = member.id and kept.task_id = json_extract(wanted.value, '$.digest')) = ${included.length}`;

  const removedStay = sql`not exists (select 1 from json_each(${JSON.stringify(removed)}) as gone join ${items} as member on member.id = gone.value where member.topic_id = ${topicId})`;

  const retainedStay = sql`not exists (select 1 from ${builtFrom(topicId)} as built where json_extract(built.value, '$.item') not in (select value from json_each(${JSON.stringify(removed)})) and ${removedFrom(topicId)})`;

  return sql`${revised} and ${includedHold} and ${removedStay} and ${retainedStay}`;
}

export function coverageGaps(topicId: number): SQL {
  const uncovered = sql`exists (select 1 from ${items} as member join ${digests} as kept on kept.item_id = member.id where member.topic_id = ${topicId} and ${notBuiltFrom(topicId, sql`member.id`, sql`kept.task_id`)})`;

  return sql`(${uncovered} or exists (${removedItemIds(topicId)}))`;
}
