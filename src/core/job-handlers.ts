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
  disagreement_proposals: disagreementProposalsHandler,
  fetch: fetchHandler,
  proposals: proposalsHandler,
  related_pick: relatedPickHandler,
  topic_overview: topicOverviewHandler,
  topic_proposals: topicProposalsHandler,
};
