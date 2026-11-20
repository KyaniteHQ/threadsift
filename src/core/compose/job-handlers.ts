import { digestHandler } from "../digest/digest-job.ts";
import { exportHandler } from "../export/export-job.ts";
import { FETCH_HANDLERS } from "../fetch/fetch-job.ts";
import type { Specs } from "../kernel/job-spec.ts";
import { relatedPickHandler } from "../related/related-job.ts";
import { restoreHandler } from "../restore/restore-job.ts";
import { disagreementProposalsHandler } from "../wiki/disagreement-job.ts";
import { proposalsHandler, topicProposalsHandler } from "../wiki/proposal-job.ts";
import { topicOverviewHandler } from "../wiki/topic-overview-job.ts";

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
