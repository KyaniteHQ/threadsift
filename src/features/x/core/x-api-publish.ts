import { sql } from "drizzle-orm";

import { report } from "../../../core/kernel/failure-log.ts";
import type { ClaimedJob, JobPorts, SettledOutcome } from "../../../core/kernel/job-outcome.ts";
import { settledFetch, settledThread } from "../../item/core/fetch-content.ts";
import {
  fewerThanStored,
  holdsAtLeastStored,
  ownerOfItem,
  repliesOf,
} from "../../thread/core/thread-store.ts";
import type { ApiRead } from "./x-api-read.ts";
import { NOTE_OF_REFUSAL } from "./x-fetcher.ts";

export async function apiPublished(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  { thread }: Readonly<ApiRead>,
  deadline: AbortSignal,
): Promise<SettledOutcome> {
  if (await fewerThanStored(ports.db, ownerOfItem(job.itemId), thread)) {
    report("x-fetch-refused", { category: "fewer-replies" });

    return settledFetch(
      ports,
      job,
      { status: "unreadable", note: NOTE_OF_REFUSAL["fewer-replies"] },
      deadline,
      null,
    );
  }

  const outcome = await settledThread(ports, job, thread, deadline, null);
  const holds = holdsAtLeastStored(job.itemId, repliesOf(thread));

  return {
    ...outcome,
    precondition: {
      holds: sql`${holds} and ${outcome.precondition?.holds ?? sql`1`}`,
      rebuild: () => apiPublished(ports, job, { status: "x-api", thread }, deadline),
    },
  };
}
