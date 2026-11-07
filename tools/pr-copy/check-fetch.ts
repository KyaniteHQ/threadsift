import { expectArticle, expectOther, requireFixture } from "./check-content.ts";
import {
  consumersOk,
  fetchJobs,
  itemDetail,
  measuredPaste,
  sumOf,
  withTag,
} from "./check-measure.ts";
import {
  BREAD,
  CLOSED_REASONS,
  SLOW_PAGE,
  TALE_OF_TWO_CITIES,
  UNRESOLVABLE,
} from "./check-pages.ts";
import type { Run } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import type { Copy } from "./copy-calls.ts";
import { endState, paste } from "./copy-client.ts";

export async function queueCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await requireFixture(findings, BREAD);
  const pasted = await measuredPaste(run, copy, "queue", BREAD.url, findings);
  expectArticle(findings, BREAD, await itemDetail(copy, pasted.id));

  findings.check(
    "the Item has one fetch job, and it is done",
    pasted.jobs.length === 1 && pasted.jobs[0]?.state === "done",
    pasted.jobs.map((job) => job.state).join(",") || "no job",
  );
  findings.measure("consumer invocations for the Item", pasted.consumers.length);
  const { ok, outcomes } = consumersOk(pasted.consumers);
  findings.check("at least one consumer invocation, every one ok", ok, outcomes);
}

export async function capCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await requireFixture(findings, TALE_OF_TWO_CITIES);
  const pasted = await measuredPaste(run, copy, "cap", TALE_OF_TWO_CITIES.url, findings);
  expectOther(findings, TALE_OF_TWO_CITIES, await itemDetail(copy, pasted.id));
  const { ok, outcomes } = consumersOk(pasted.consumers);
  findings.check("every consumer invocation ended ok", ok, outcomes);
  findings.measure("total fetch-consumer cpu ms", sumOf(pasted.consumers, "cpuMs"));
  findings.measure("total fetch-consumer wall ms", sumOf(pasted.consumers, "wallMs"));
}

export async function unreachableCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await run.pace.settle();

  const gone = await paste(copy, withTag(UNRESOLVABLE, `${run.tag}-unreachable`));
  const silent = await paste(copy, withTag(SLOW_PAGE, `${run.tag}-unreachable`));

  if (!gone.created || !silent.created) {
    throw new Inconclusive("a link was already known to the copy, so it was a refresh");
  }

  const [goneEnd, silentEnd] = [await endState(copy, gone.id), await endState(copy, silent.id)];

  const jobs = await Promise.all([gone.id, silent.id].map((id) => fetchJobs(run, id)));
  findings.item(gone.id);
  findings.item(silent.id);

  for (const job of jobs.flat()) findings.job(job.id);

  run.pace.done();

  findings.check(
    "a host that does not resolve ends failed with a network fetch and no title",
    goneEnd.status === "failed" && goneEnd.fetch === "network" && goneEnd.title === null,
    `${goneEnd.status} ${goneEnd.fetch ?? "no fetch"}`,
  );
  findings.check(
    "a page that stops answering ends failed with a reason from the closed list",
    silentEnd.status === "failed" &&
      silentEnd.reason !== null &&
      CLOSED_REASONS.includes(silentEnd.reason),
    `${silentEnd.status} ${silentEnd.reason ?? "no reason"}`,
  );
}
