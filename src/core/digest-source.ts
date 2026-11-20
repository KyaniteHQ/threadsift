import { and, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { items, redditComments, redditThreads } from "./schema.ts";

function eligibleComments(): SQL {
  return sql`exists (select 1 from ${redditComments} where ${redditComments.itemId} = ${items.id} and ${redditComments.generation} = ${items.generation} and ${redditComments.eligible} = 1)`;
}

export function candidateLink(): SQL<string | null> {
  return sql<
    string | null
  >`(select ${redditThreads.linkedUrl} from ${redditThreads} where ${redditThreads.itemId} = ${items.id} and ${redditThreads.generation} = ${items.generation})`;
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
