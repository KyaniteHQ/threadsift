import { routedJob } from "./bot-step.ts";
import { BOT_TASK_KINDS } from "./bot-task-kinds.ts";
import { digestHandler } from "./digest-attempt.ts";
import { disagreementProposalsHandler } from "./disagreement-job.ts";
import { exportHandler } from "./export-job.ts";
import { FETCH_HANDLERS } from "./fetch-job.ts";
import type { ModelDeclaration, Specs } from "./job-spec.ts";
import { proposalsHandler, topicProposalsHandler } from "./proposal-job.ts";
import { relatedPickHandler } from "./related-job.ts";
import { restoreHandler } from "./restore-job.ts";
import { topicOverviewHandler } from "./topic-overview-job.ts";

type RoutedKind = Exclude<keyof typeof BOT_TASK_KINDS, "digest">;

function routed<Kind extends RoutedKind>(kind: Kind, model: Readonly<ModelDeclaration>) {
  return routedJob(kind, model, BOT_TASK_KINDS[kind]);
}

export const HANDLERS = {
  ...FETCH_HANDLERS,
  digest: digestHandler,
  topic_overview: routed("topic_overview", topicOverviewHandler),
  related_pick: routed("related_pick", relatedPickHandler),
  proposals: routed("proposals", proposalsHandler),
  topic_proposals: routed("topic_proposals", topicProposalsHandler),
  disagreement_proposals: routed("disagreement_proposals", disagreementProposalsHandler),
  export: exportHandler,
  restore: restoreHandler,
} satisfies Specs;
