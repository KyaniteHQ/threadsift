import { routedJob } from "./bot-step.ts";
import { BOT_TASK_KINDS } from "./bot-task-kinds.ts";
import { digestHandler } from "./digest-attempt.ts";
import { disagreementProposalsHandler } from "./disagreement-job.ts";
import { exportHandler } from "./export-job.ts";
import { FETCH_HANDLERS } from "./fetch-job.ts";
import type { Specs } from "./job-spec.ts";
import { proposalsHandler, topicProposalsHandler } from "./proposal-job.ts";
import { relatedPickHandler } from "./related-job.ts";
import { restoreHandler } from "./restore-job.ts";
import { topicOverviewHandler } from "./topic-overview-job.ts";

export const HANDLERS = {
  ...FETCH_HANDLERS,
  digest: digestHandler,
  topic_overview: routedJob("topic_overview", topicOverviewHandler, BOT_TASK_KINDS.topic_overview),
  related_pick: routedJob("related_pick", relatedPickHandler, BOT_TASK_KINDS.related_pick),
  proposals: routedJob("proposals", proposalsHandler, BOT_TASK_KINDS.proposals),
  topic_proposals: routedJob(
    "topic_proposals",
    topicProposalsHandler,
    BOT_TASK_KINDS.topic_proposals,
  ),
  disagreement_proposals: routedJob(
    "disagreement_proposals",
    disagreementProposalsHandler,
    BOT_TASK_KINDS.disagreement_proposals,
  ),
  export: exportHandler,
  restore: restoreHandler,
} satisfies Specs;
