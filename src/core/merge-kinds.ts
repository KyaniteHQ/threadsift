import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { MERGE_KINDS } from "./kinds.ts";
import type { MergeKindSpec, MergeSpecs } from "./merge-unit.ts";
import { itemTags, items, logEntries, pins, proposals, tags, topics } from "./schema.ts";
import { planTagUnit } from "./tag-merge.ts";
import { planTopicUnit } from "./topic-merge.ts";

export const MERGE: MergeSpecs = {
  "tag-merge": {
    table: tags,
    from: proposals.fromTagId,
    into: proposals.intoTagId,
    subjects: (from, into) => ({ fromTagId: from, intoTagId: into }),
    pin: { column: pins.intoTagId, set: (id) => ({ intoTagId: id }) },
    itemLink: { entry: itemTags.tagId, item: itemTags.itemId },
    alsoLinked: [],
    log: "merge",
    plan: planTagUnit,
  },
  "topic-merge": {
    table: topics,
    from: proposals.fromTopicId,
    into: proposals.intoTopicId,
    subjects: (from, into) => ({ fromTopicId: from, intoTopicId: into }),
    pin: { column: pins.intoTopicId, set: (id) => ({ intoTopicId: id }) },
    itemLink: { entry: items.topicId, item: items.id },
    alsoLinked: [logEntries.topicId],
    log: "merge-topic",
    plan: planTopicUnit,
  },
};

export function acrossKinds<Value>(pick: (spec: MergeKindSpec) => SQLWrapper): SQL<Value> {
  const picked = MERGE_KINDS.map((kind) => sql`${pick(MERGE[kind])}`);

  return sql<Value>`coalesce(${sql.join(picked, sql`, `)})`;
}
