import { digestHandler } from "./digest-attempt.ts";
import { fetchHandler } from "./fetch-job.ts";
import type { JobHandler } from "./job-outcome.ts";
import type { JobKind } from "./kinds.ts";
import { topicOverviewHandler } from "./topic-overview-job.ts";

export const HANDLERS: Readonly<Record<JobKind, JobHandler>> = {
  digest: digestHandler,
  fetch: fetchHandler,
  topic_overview: topicOverviewHandler,
};
