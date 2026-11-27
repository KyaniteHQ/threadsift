import { and, isNotNull, isNull, not, or, sql, type SQL } from "drizzle-orm";

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

function readByXApi(): SQL {
  return sql`exists (select 1 from ${threads} where ${threads.itemId} = ${items.id} and ${threads.generation} = ${items.generation} and ${threads.xApiRead} = 1)`;
}

function providerMayRead(): SQL {
  return X_API_PROVIDER_DIGESTS
    ? sql`1`
    : (or(isNotNull(items.pendingDigest), not(readByXApi())) ?? sql`0`);
}

export function hasDigestSource() {
  return and(or(...digestContent(), hasCandidateLink()), providerMayRead()) ?? sql`0`;
}
