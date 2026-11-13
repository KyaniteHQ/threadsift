import { type SQL, sql } from "drizzle-orm";

import { membersOf, readDisagreementInput } from "./disagreement-input.ts";
import { pairPinned } from "./disagreement-pins.ts";
import { clearedStaleDisagreements } from "./disagreement-rows.ts";
import {
  DISAGREEMENT_OUTPUT_TOKENS,
  type DisagreementsResult,
  type SentTopic,
  disagreementTask,
} from "./disagreement-task.ts";
import type { JobWrites } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { proposalRow } from "./proposal-lifecycle.ts";
import { proposals, topicChecks } from "./schema.ts";
import { type WeeklyModelRun, storedField, weeklyModelHandler } from "./weekly-model-run.ts";

type Sent = readonly Readonly<SentTopic>[];

function readMembers(sent: Sent): string {
  return JSON.stringify(sent.map(({ id, members }) => ({ topic: id, members })));
}

function membersStill(sent: Sent): SQL {
  return sql`not exists (select 1 from json_each(${readMembers(sent)}) as read where ${membersOf(sql`json_extract(read.value, '$.topic')`)} is not json_extract(read.value, '$.members'))`;
}

function pairRows(sent: Sent, { disagreements }: Readonly<DisagreementsResult>) {
  const digestOf = new Map(
    sent.flatMap(({ items }) => items.map(({ id, digest }) => [id, digest] as const)),
  );

  return disagreements.map(({ a, b, reason }) => {
    const [from, into] = a < b ? [a, b] : [b, a];

    return {
      from,
      into,
      fromDigest: digestOf.get(from),
      intoDigest: digestOf.get(into),
      reason,
    };
  });
}

function storedPairs(db: Database, sent: Sent, result: Readonly<DisagreementsResult>): JobWrites {
  if (result.disagreements.length === 0) return [];

  return [
    db
      .insert(proposals)
      .select(
        db
          .select(
            proposalRow(
              {
                kind: "items-disagree",
                state: sql`'open'`,
                reason: storedField("reason"),
                createdAt: Date.now(),
              },
              {
                fromItemId: storedField("from"),
                intoItemId: storedField("into"),
                fromDigest: storedField("fromDigest"),
                intoDigest: storedField("intoDigest"),
              },
            ),
          )
          .from(sql`json_each(${JSON.stringify(pairRows(sent, result))}) as stored`)
          .where(sql`not ${pairPinned(storedField("from"), storedField("into"))}`),
      )
      .onConflictDoNothing(),
  ];
}

function checkedTopics(db: Database, sent: Sent): JobWrites {
  return [
    db
      .insert(topicChecks)
      .select(
        db
          .select({
            topicId: storedField<number>("topic").as("topic_id"),
            members: storedField<string>("members").as("members"),
            checkedAt: sql<number>`${Date.now()}`.as("checked_at"),
          })
          .from(sql`json_each(${readMembers(sent)}) as stored`)
          .where(sql`true`),
      )
      .onConflictDoUpdate({
        target: topicChecks.topicId,
        set: { members: sql`excluded.members`, checkedAt: sql`excluded.checked_at` },
      }),
  ];
}

export const disagreementRun: WeeklyModelRun<Sent, DisagreementsResult> = {
  label: "Disagreement proposals run",
  event: "disagreement-proposals-run-failed",
  maxOutputTokens: DISAGREEMENT_OUTPUT_TOKENS,
  read: readDisagreementInput,
  task: disagreementTask,
  current: membersStill,
  stored: (db, { sent, result }) => [
    clearedStaleDisagreements(db),
    ...storedPairs(db, sent, result),
    ...checkedTopics(db, sent),
  ],
};

export const disagreementProposalsHandler = weeklyModelHandler(disagreementRun);
