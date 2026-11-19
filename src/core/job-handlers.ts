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
  topic_overview: topicOverviewHandler,
  related_pick: relatedPickHandler,
  proposals: proposalsHandler,
  topic_proposals: topicProposalsHandler,
  disagreement_proposals: disagreementProposalsHandler,
  export: exportHandler,
  restore: restoreHandler,
} satisfies Specs;
