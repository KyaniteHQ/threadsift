import { routedHandler } from "./bot-step.ts";
import { BOT_TASK_KINDS } from "./bot-task-kinds.ts";
import { digestHandler } from "./digest-attempt.ts";
import { disagreementProposalsHandler } from "./disagreement-job.ts";
import { FETCH_HANDLERS } from "./fetch-job.ts";
import type { JobHandlers } from "./job-outcome.ts";
import { proposalsHandler, topicProposalsHandler } from "./proposal-job.ts";
import { relatedPickHandler } from "./related-job.ts";
import { topicOverviewHandler } from "./topic-overview-job.ts";
import { UNOWNED_HANDLERS } from "./unowned-handlers.ts";

export const HANDLERS: JobHandlers = {
  digest: digestHandler,
  disagreement_proposals: routedHandler(
    disagreementProposalsHandler,
    BOT_TASK_KINDS.disagreement_proposals,
  ),
  ...UNOWNED_HANDLERS,
  ...FETCH_HANDLERS,
  proposals: routedHandler(proposalsHandler, BOT_TASK_KINDS.proposals),
  related_pick: routedHandler(relatedPickHandler, BOT_TASK_KINDS.related_pick),
  topic_overview: routedHandler(topicOverviewHandler, BOT_TASK_KINDS.topic_overview),
  topic_proposals: routedHandler(topicProposalsHandler, BOT_TASK_KINDS.topic_proposals),
};
