import { and, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { items, threadComments, threads } from "./schema.ts";

function eligibleComments(): SQL {
  return sql`exists (select 1 from ${threadComments} where ${threadComments.itemId} = ${items.id} and ${threadComments.generation} = ${items.generation} and ${threadComments.eligible} = 1)`;
}

export function candidateLink(): SQL<string | null> {
  return sql<
    string | null
  >`(select ${threads.linkedUrl} from ${threads} where ${threads.itemId} = ${items.id} and ${threads.generation} = ${items.generation})`;
}

function digestContent() {
  return [isNotNull(items.postText), isNotNull(items.postTextKey), eligibleComments()] as const;
}

function hasCandidateLink() {
  return and(isNull(items.pendingDigest), isNotNull(candidateLink())) ?? sql`0`;
}

export function hasDigestContent() {
  return or(...digestContent()) ?? sql`0`;
}

export function hasDigestSource() {
  return or(...digestContent(), hasCandidateLink()) ?? sql`0`;
}
