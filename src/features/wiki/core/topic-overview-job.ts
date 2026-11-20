import { AI_DEADLINE_MS } from "../../../core/contract/ai-contract.ts";
import { defineJob } from "../../../core/kernel/job-spec.ts";
import { topicOverviewKind } from "./topic-overview-kind.ts";
import { overviewGaveUp } from "./topic-overview-run.ts";

export const topicOverviewHandler = defineJob("topic_overview", {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: topicOverviewKind.attempt,
  exhausted: (db, job) => overviewGaveUp(db, job),
});
