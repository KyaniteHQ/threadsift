import { type SQLWrapper, and, desc, eq, sql } from "drizzle-orm";

import type { Database } from "../../../core/kernel/database.ts";
import { listedSummary } from "../../../core/kernel/digest-stored.ts";
import { itemsDisagreeProposals, proposals, topics } from "../../../core/kernel/schema.ts";
import { acceptDisagreement } from "./disagreement-accept.ts";
import {
  DISAGREEMENT,
  firstDigest,
  firstItem,
  secondDigest,
  secondItem,
  staleDisagreements,
} from "./disagreement-rows.ts";
import type { ProposalKindSpec } from "./proposal-kind.ts";
import { HEAD_COLUMNS, PAGE_ROWS, listedAfter } from "./proposal-rows.ts";
import { modelCheck } from "./weekly-check.ts";

function sideColumns(
  prefix: string,
  { id, title, stored }: Readonly<Record<"id" | "title" | "stored", Readonly<SQLWrapper>>>,
) {
  return {
    id: sql<number>`${id}`.as(`${prefix}_id`),
    title: sql<string>`${title}`.as(`${prefix}_title`),
    summary: listedSummary(stored).as(`${prefix}_summary`),
  };
}

function disagreePage(db: Database, cursor: number | null) {
  return db
    .select({
      ...HEAD_COLUMNS,
      topicKey: topics.key,
      topicName: topics.name,
      first: sideColumns("first", {
        id: firstItem.id,
        title: firstDigest.title,
        stored: firstDigest.digest,
      }),
      second: sideColumns("second", {
        id: secondItem.id,
        title: secondDigest.title,
        stored: secondDigest.digest,
      }),
    })
    .from(proposals)
    .innerJoin(itemsDisagreeProposals, eq(itemsDisagreeProposals.proposalId, proposals.id))
    .innerJoin(firstItem, eq(firstItem.id, itemsDisagreeProposals.fromItemId))
    .innerJoin(secondItem, eq(secondItem.id, itemsDisagreeProposals.intoItemId))
    .innerJoin(topics, eq(topics.id, firstItem.topicId))
    .innerJoin(
      firstDigest,
      and(
        eq(firstDigest.itemId, firstItem.id),
        eq(firstDigest.taskId, itemsDisagreeProposals.fromDigest),
      ),
    )
    .innerJoin(
      secondDigest,
      and(
        eq(secondDigest.itemId, secondItem.id),
        eq(secondDigest.taskId, itemsDisagreeProposals.intoDigest),
      ),
    )
    .where(listedAfter("items-disagree", cursor, DISAGREEMENT.listed))
    .orderBy(desc(proposals.id))
    .limit(PAGE_ROWS);
}

type DisagreeRow = Awaited<ReturnType<typeof disagreePage>>[number];

function disagreeOf(row: Readonly<DisagreeRow>) {
  return {
    id: row.id,
    kind: "items-disagree" as const,
    state: row.state,
    reason: row.reason ?? "",
    topic: { key: row.topicKey, name: row.topicName },
    first: row.first,
    second: row.second,
  };
}

export const ITEMS_DISAGREE = {
  stage: "disagreement-proposals",
  accept: ({ db }, id) => acceptDisagreement(db, id),
  page: disagreePage,
  pageEntry: disagreeOf,
  weekly: modelCheck("items-disagree", (db, now) => [staleDisagreements(db, now)]),
} satisfies ProposalKindSpec<"items-disagree">;
