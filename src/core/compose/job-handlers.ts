import { digestHandler } from "../../features/digest/core/digest-job.ts";
import { exportHandler } from "../../features/export/core/export-job.ts";
import { FETCH_HANDLERS } from "../../features/fetch/core/fetch-job.ts";
import { relatedPickHandler } from "../../features/related/core/related-job.ts";
import { restoreHandler } from "../../features/restore/core/restore-job.ts";
import { disagreementProposalsHandler } from "../../features/wiki/core/disagreement-job.ts";
import { proposalsHandler, topicProposalsHandler } from "../../features/wiki/core/proposal-job.ts";
import { topicOverviewHandler } from "../../features/wiki/core/topic-overview-job.ts";
import type { Specs } from "../kernel/job-spec.ts";

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
