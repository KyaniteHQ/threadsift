import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "../../../core/kernel/database.ts";
import type { ClaimedJob, Closing, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { githubClosing } from "../../github/core/github-cooldown.ts";
import { redditClosed, redditClosing } from "../../reddit/core/reddit-account-queue.ts";
import { isRedditJob } from "./fetch-read.ts";

export function fetchClosing(
  db: Database,
  job: Readonly<ClaimedJob>,
  how: Closing,
): readonly BatchItem<"sqlite">[] {
  return [...(isRedditJob(job) ? redditClosing(db, job, how) : []), ...githubClosing(db, job, how)];
}

export async function fetchClosed(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  closed: boolean,
): Promise<void> {
  if (isRedditJob(job)) await redditClosed(ports, job, closed);
}
