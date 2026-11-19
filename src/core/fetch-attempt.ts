import { outcomeOfFetched } from "./fetch-outcome.ts";
import { fetchedForJob } from "./fetch-source.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { X_READER_BOT } from "./kinds.ts";
import { FETCH_DEADLINE_MS, X_RUN_DEADLINE_MS, X_SLOT_WAIT_MS } from "./request-waits.ts";
import { xIntakeKind } from "./x-intake.ts";
import { NO_READER, xRouteOf } from "./x-reader.ts";

export async function attemptFetch(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome> {
  const route = job.page === null ? await xRouteOf(ports, job) : NO_READER;

  if (route.kind === X_READER_BOT) return xIntakeKind.attempt(ports, job);

  const deadline = AbortSignal.timeout(
    route.kind === "grok-cli" ? X_RUN_DEADLINE_MS + X_SLOT_WAIT_MS : FETCH_DEADLINE_MS,
  );

  const fetched = await fetchedForJob(ports, job, deadline, route);

  return outcomeOfFetched(ports, job, fetched, deadline);
}
