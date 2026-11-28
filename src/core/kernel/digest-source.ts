import { and, isNotNull, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { X_API_PROVIDER_DIGESTS } from "../contract/x-api-contract.ts";
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

export function providerMayRead(itemId: Readonly<SQLWrapper>): SQL {
  return X_API_PROVIDER_DIGESTS
    ? sql`1`
    : sql`not exists (select 1 from ${threads} join ${items} as read_item on read_item.id = ${threads.itemId} and read_item.generation = ${threads.generation} where ${threads.itemId} = ${itemId} and ${threads.xApiRead} = 1)`;
}

export function hasDigestSource() {
  return (
    and(
      or(...digestContent(), hasCandidateLink()),
      or(isNotNull(items.pendingDigest), providerMayRead(items.id)),
    ) ?? sql`0`
  );
}
