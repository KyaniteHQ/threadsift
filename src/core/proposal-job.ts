import { AI_DEADLINE_MS, AI_LIST_OUTPUT_TOKENS } from "./ai-contract.ts";
import { readCatalogVersion } from "./catalog.ts";
import { defineJob } from "./job-spec.ts";
import { MERGE } from "./merge-kinds.ts";
import { type MergeKind, WEEKLY_TASK } from "./proposal-contract.ts";
import { proposalsInput, readProposalPairs } from "./proposal-input.ts";
import { type Sent, SentPairsSchema } from "./proposal-sent.ts";
import { sentExist, storedMerges } from "./proposal-stored.ts";
import { type ProposalsResult, proposalsTask } from "./proposal-task.ts";
import { type WeeklyRun, weeklyKind } from "./weekly-kind.ts";

function runOf(kind: MergeKind): WeeklyRun<Sent, ProposalsResult> {
  return {
    kind: WEEKLY_TASK[kind],
    label: MERGE[kind].label,
    event: MERGE[kind].event,
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
