import { routedHandler } from "./bot-step.ts";
import { BOT_TASK_KINDS } from "./bot-task-kinds.ts";
import { digestHandler } from "./digest-attempt.ts";
import { disagreementProposalsHandler } from "./disagreement-job.ts";
import { fetchHandler } from "./fetch-job.ts";
import type { JobHandler } from "./job-outcome.ts";
import type { JobKind } from "./kinds.ts";
import { proposalsHandler, topicProposalsHandler } from "./proposal-job.ts";
import { relatedPickHandler } from "./related-job.ts";
import { topicOverviewHandler } from "./topic-overview-job.ts";

export const HANDLERS: Readonly<Record<JobKind, JobHandler>> = {
  digest: digestHandler,
  disagreement_proposals: routedHandler(
    disagreementProposalsHandler,
    BOT_TASK_KINDS.disagreement_proposals,
  ),
  fetch: fetchHandler,
  proposals: routedHandler(proposalsHandler, BOT_TASK_KINDS.proposals),
  related_pick: routedHandler(relatedPickHandler, BOT_TASK_KINDS.related_pick),
  topic_overview: routedHandler(topicOverviewHandler, BOT_TASK_KINDS.topic_overview),
  topic_proposals: routedHandler(topicProposalsHandler, BOT_TASK_KINDS.topic_proposals),
};
