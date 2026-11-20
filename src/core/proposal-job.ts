import { type SQL, sql } from "drizzle-orm";

import { AI_DEADLINE_MS, AI_LIST_OUTPUT_TOKENS } from "./ai-contract.ts";
import { readCatalogVersion } from "./catalog.ts";
import { defineJob } from "./job-spec.ts";
import type { MergeKind } from "./kinds.ts";
import { MERGE } from "./merge-kinds.ts";
import { proposalsInput, readProposalPairs } from "./proposal-input.ts";
import { storedMerges } from "./proposal-stored.ts";
import {
  type ProposalsResult,
  type Sent,
  SentPairsSchema,
  proposalsTask,
  proposalsTaskKind,
} from "./proposal-task.ts";
import { type WeeklyRun, weeklyKind } from "./weekly-kind.ts";

const RUNS: Readonly<Record<MergeKind, { readonly label: string; readonly event: string }>> = {
  "tag-merge": { label: "Proposals run", event: "proposals-run-failed" },
  "topic-merge": { label: "Topic proposals run", event: "topic-proposals-run-failed" },
};

function sentExist(kind: MergeKind, sent: Sent): SQL {
  const ids = JSON.stringify(sent.flatMap(({ low, high }) => [low.id, high.id]));
  const { table } = MERGE[kind];

  return sql`not exists (select 1 from json_each(${ids}) as wanted where not exists (select 1 from ${table} where ${table.id} = wanted.value))`;
}

function runOf(kind: MergeKind): WeeklyRun<Sent, ProposalsResult> {
  return {
    ...RUNS[kind],
    kind: proposalsTaskKind(kind),
    sent: SentPairsSchema,
    maxOutputTokens: AI_LIST_OUTPUT_TOKENS,
    read: async (db) => {
      const inputRevision = await readCatalogVersion(db);
      const { input, sent } = proposalsInput(await readProposalPairs(db, kind));

      return sent.length === 0 ? null : { input, inputRevision, sent };
    },
    task: (sent) => proposalsTask(kind, sent),
    current: (sent) => sentExist(kind, sent),
    stored: (db, { sent, result }) => storedMerges(db, kind, sent, result.merges),
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
