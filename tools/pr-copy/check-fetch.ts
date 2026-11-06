import { expectArticle, expectOther, requireFixture } from "./check-content.ts";
import { fetchJobs, itemDetail, measuredPaste, withTag } from "./check-measure.ts";
import {
  BREAD,
  CLOSED_REASONS,
  SILENT_PORT,
  TALE_OF_TWO_CITIES,
  UNRESOLVABLE,
} from "./check-pages.ts";
import type { Run } from "./check-run.ts";
import type { Findings } from "./check-types.ts";
import { type Copy, endState, paste } from "./copy-client.ts";

export async function queueCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await requireFixture(findings, BREAD);
  const pasted = await measuredPaste(run, copy, BREAD.url, findings);
  expectArticle(findings, BREAD, await itemDetail(copy, pasted.id));

  const jobs = await fetchJobs(run, pasted.id);

  for (const job of jobs) findings.job(job.id);

  findings.check(
    "the Item has one fetch job, and it is done",
    jobs.length === 1 && jobs[0]?.state === "done",
    jobs.map((job) => job.state).join(",") || "no job",
  );
  findings.measure("consumer invocations for the Item", pasted.consumers.length);
  findings.check(
    "at least one consumer invocation, every one ok",
    pasted.consumers.length > 0 && pasted.consumers.every((entry) => entry.outcome === "ok"),
    pasted.consumers.map((entry) => entry.outcome).join(",") || "none",
  );
}

export async function capCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await requireFixture(findings, TALE_OF_TWO_CITIES);
  const pasted = await measuredPaste(run, copy, TALE_OF_TWO_CITIES.url, findings);
  expectOther(findings, TALE_OF_TWO_CITIES, await itemDetail(copy, pasted.id));
  findings.check(
    "every consumer invocation ended ok",
    pasted.consumers.length > 0 && pasted.consumers.every((entry) => entry.outcome === "ok"),
    pasted.consumers.map((entry) => entry.outcome).join(",") || "none",
  );
  findings.measure(
    "total fetch-consumer cpu ms",
    pasted.consumers.reduce((sum, entry) => sum + entry.cpuMs, 0),
  );
  findings.measure(
    "total fetch-consumer wall ms",
    pasted.consumers.reduce((sum, entry) => sum + entry.wallMs, 0),
  );
}

export async function unreachableCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  const gone = await paste(copy, withTag(UNRESOLVABLE, run.tag));
  const silent = await paste(copy, withTag(SILENT_PORT, run.tag));
  findings.item(gone);
  findings.item(silent);

  const [goneEnd, silentEnd] = [await endState(copy, gone), await endState(copy, silent)];

  findings.check(
    "a host that does not resolve ends failed with a network fetch and no title",
    goneEnd.status === "failed" && goneEnd.fetch === "network" && goneEnd.title === null,
    `${goneEnd.status} ${goneEnd.fetch ?? "no fetch"}`,
  );
  findings.check(
    "a port that never answers ends failed with a reason from the closed list",
    silentEnd.status === "failed" && CLOSED_REASONS.includes(silentEnd.reason),
    `${silentEnd.status} ${silentEnd.reason ?? "no reason"}`,
  );
}
