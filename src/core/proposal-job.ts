import { type SQL, sql } from "drizzle-orm";

import { AI_DEADLINE_MS } from "./ai-contract.ts";
import { readCatalogVersion } from "./catalog.ts";
import type { Database } from "./database.ts";
import type { JobWrites } from "./job-outcome.ts";
import { defineJob } from "./job-spec.ts";
import type { MergeKind } from "./kinds.ts";
import { pairKey } from "./proposal-candidates.ts";
import { proposalsInput, readProposalPairs } from "./proposal-input.ts";
import { type InsertedState, proposalRow } from "./proposal-lifecycle.ts";
import {
  PROPOSALS_OUTPUT_TOKENS,
  type ProposalsResult,
  type SentPair,
  SentPairsSchema,
  proposalsTask,
  proposalsTaskKind,
} from "./proposal-task.ts";
import { proposals, tags, topics } from "./schema.ts";
import { type WeeklyRun, storedField, weeklyKind } from "./weekly-kind.ts";

interface StoredRow {
  readonly from: number;
  readonly into: number;
  readonly reason: string | null;
  readonly state: InsertedState<MergeKind>;
}

type Sent = readonly Readonly<SentPair>[];

const RUNS: Readonly<Record<MergeKind, { readonly label: string; readonly event: string }>> = {
  "tag-merge": { label: "Proposals run", event: "proposals-run-failed" },
  "topic-merge": { label: "Topic proposals run", event: "topic-proposals-run-failed" },
};

function sentExist(kind: MergeKind, sent: Sent): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));
  const table = kind === "tag-merge" ? tags : topics;

  return sql`not exists (select 1 from json_each(${ids}) as wanted where not exists (select 1 from ${table} where ${table.id} = wanted.value))`;
}

function rowsOf(sent: Sent, merges: ProposalsResult["merges"]): readonly StoredRow[] {
  const merged = new Set(merges.map(({ from, into }) => pairKey(from, into)));

  return [
    ...merges.map(({ from, into, reason }) => ({ from, into, reason, state: "open" as const })),
    ...sent.flatMap(({ low, high }) =>
      merged.has(pairKey(low.id, high.id))
        ? []
        : [{ from: low.id, into: high.id, reason: null, state: "declined" as const }],
    ),
  ];
}

function storedRows(
  db: Database,
  kind: MergeKind,
  rows: readonly Readonly<StoredRow>[],
): JobWrites {
  if (rows.length === 0) return [];

  const side = (own: MergeKind, path: "from" | "into") =>
    kind === own ? storedField(path) : sql`null`;

  return [
    db
      .insert(proposals)
      .select(
        db
          .select(
            proposalRow(
              {
                kind,
                state: storedField("state"),
                reason: storedField("reason"),
                createdAt: Date.now(),
              },
              {
                fromTagId: side("tag-merge", "from"),
                intoTagId: side("tag-merge", "into"),
                fromTopicId: side("topic-merge", "from"),
                intoTopicId: side("topic-merge", "into"),
              },
            ),
          )
          .from(sql`json_each(${JSON.stringify(rows)}) as stored`)
          .where(sql`true`),
      )
      .onConflictDoNothing(),
  ];
}

function runOf(kind: MergeKind): WeeklyRun<Sent, ProposalsResult> {
  return {
    ...RUNS[kind],
    kind: proposalsTaskKind(kind),
    sent: SentPairsSchema,
    maxOutputTokens: PROPOSALS_OUTPUT_TOKENS,
    read: async (db) => {
      const inputRevision = await readCatalogVersion(db);
      const { input, sent } = proposalsInput(await readProposalPairs(db, kind));

      return sent.length === 0 ? null : { input, inputRevision, sent };
    },
    task: (sent) => proposalsTask(kind, sent),
    current: (sent) => sentExist(kind, sent),
    stored: (db, { sent, result }) => storedRows(db, kind, rowsOf(sent, result.merges)),
  };
}

export const proposalsKind = weeklyKind(runOf("tag-merge"));

export const topicProposalsKind = weeklyKind(runOf("topic-merge"));

export const proposalsHandler = defineJob("proposals", {
  deadlineMs: AI_DEADLINE_MS,
  attempt: proposalsKind.attempt,
});

export const topicProposalsHandler = defineJob("topic_proposals", {
  deadlineMs: AI_DEADLINE_MS,
  attempt: topicProposalsKind.attempt,
});
