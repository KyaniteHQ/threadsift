import { botStep } from "./bot-step.ts";
import { FETCH_DEADLINE_MS } from "./fetch-link.ts";
import { outcomeOfFetched } from "./fetch-outcome.ts";
import { fetchedForJob } from "./fetch-source.ts";
import type { ClaimedJob, JobOutcome, JobPorts } from "./job-outcome.ts";
import { xIntakeKind } from "./x-intake.ts";
import { NO_READER, xRouteOf } from "./x-reader.ts";

export async function attemptFetch(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
): Promise<JobOutcome> {
  const route = job.page === null ? await xRouteOf(ports, job) : NO_READER;

  if (route.kind === "grok-bot") return botStep(ports, job, xIntakeKind);

  const deadline = AbortSignal.timeout(FETCH_DEADLINE_MS);
  const fetched = await fetchedForJob(ports, job, deadline, route);

  return outcomeOfFetched(ports, job, fetched, deadline);
}
