import { setTimeout as sleep } from "node:timers/promises";

import { ItemResponseSchema } from "../../src/http/schemas.ts";
import {
  INGEST_DEADLINE_MS,
  SENTINEL_ROUTE,
  SKEW_MS,
  fetchJobs,
  requireIdleCopy,
  withTag,
} from "./check-measure.ts";
import type { Run } from "./check-run.ts";
import { type Findings, Inconclusive } from "./check-types.ts";
import { type Copy, callCopy, send } from "./copy-calls.ts";
import { endState, expectOk, paste } from "./copy-client.ts";
import { purgeStatus, resumeDelivery, setDeliveryPaused, startPurge } from "./copy-control.ts";
import { awaitInvocations } from "./telemetry.ts";

const CRON_WAIT_MS = 20 * 60_000;
const PURGE_DEADLINE_MS = 300_000;
const PURGE_POLL_MS = 2000;
const ATTEMPTS = 2;
const LINK = "https://example.com/";

async function awaitPurge(
  run: Readonly<Run>,
  earlier: string | null,
  deadline: number,
): Promise<number> {
  const status = await purgeStatus(run.stage, run.stage.target.queue);

  if (status.complete && status.startedAt !== earlier) return Date.now();

  if (Date.now() >= deadline) {
    throw new Inconclusive("the purge did not complete before its deadline");
  }

  await sleep(PURGE_POLL_MS);

  return awaitPurge(run, earlier, deadline);
}

async function awaitScheduledTick(run: Readonly<Run>, findings: Readonly<Findings>): Promise<void> {
  const now = Date.now();

  const { found, complete } = await awaitInvocations(
    run.stage,
    { version: run.version, trigger: "scheduled" },
    { from: now - CRON_WAIT_MS, to: now + CRON_WAIT_MS },
    { deadlineMs: CRON_WAIT_MS, enough: (seen) => seen.some((entry) => entry.outcome === "ok") },
  );

  findings.used(found);
  findings.check(
    "the copy has had a scheduled invocation within 20 minutes",
    complete,
    `${String(found.length)} seen`,
  );

  if (!complete) throw new Inconclusive("no scheduled invocation appeared within 20 minutes");
}

interface Held {
  readonly id: number;
  readonly pastedAt: number;
  readonly purgedAt: number;
  readonly resumedAt: number;
  readonly removed: boolean;
}

async function holdAndPurge(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
  attempt: number,
): Promise<Held> {
  const { stage } = run;
  await setDeliveryPaused(stage, stage.target.queue, true);

  const pastedAt = Date.now();
  const id = await paste(copy, withTag(LINK, `${run.tag}-cron-${String(attempt)}`));
  findings.item(id);

  const queued = await fetchJobs(run, id);
  queued.forEach((job) => {
    findings.job(job.id);
  });
  findings.check(
    "the new Item has one queued fetch job",
    queued.length === 1 && queued[0]?.state === "queued",
    queued.map((job) => job.state).join(",") || "no job",
  );

  const earlier = (await purgeStatus(stage, stage.target.queue)).startedAt;
  await startPurge(stage, stage.target.queue);
  const purgedAt = await awaitPurge(run, earlier, Date.now() + PURGE_DEADLINE_MS);

  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });
  await expectOk(response, path);
  const item = ItemResponseSchema.parse(await response.json()).item;
  const after = await fetchJobs(run, id);

  const removed =
    item.status === "processing" && after.length === 1 && after[0]?.state === "queued";

  const resumedAt = Date.now();
  await setDeliveryPaused(stage, stage.target.queue, false);

  return { id, pastedAt, purgedAt, resumedAt, removed };
}

async function heldAndResumed(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
  attempt: number,
): Promise<Held> {
  try {
    return await holdAndPurge(run, copy, findings, attempt);
  } catch (error) {
    try {
      await resumeDelivery(run.stage);
    } catch (resumeError) {
      process.stderr.write(
        `${resumeError instanceof Error ? resumeError.message : "the resume failed"}\n`,
      );
    }

    throw error;
  }
}

async function recoveryInvocations(run: Readonly<Run>, held: Readonly<Held>) {
  await send(run.url, { path: SENTINEL_ROUTE });

  const { found, complete } = await awaitInvocations(
    run.stage,
    { version: run.version },
    { from: held.pastedAt - SKEW_MS, to: Date.now() + INGEST_DEADLINE_MS },
    {
      deadlineMs: INGEST_DEADLINE_MS,
      enough: (seen) =>
        seen.some((entry) => entry.name === SENTINEL_ROUTE && entry.at >= held.resumedAt) &&
        seen.some((entry) => entry.trigger === "queue" && entry.at > held.purgedAt),
    },
  );

  if (!complete) {
    throw new Inconclusive("the telemetry did not show the recovery before its deadline");
  }

  return found;
}

async function orderOfInvocations(
  run: Readonly<Run>,
  held: Readonly<Held>,
  findings: Readonly<Findings>,
): Promise<boolean> {
  const found = await recoveryInvocations(run, held);
  findings.used(found);

  const tick = found.find(
    (entry) => entry.trigger === "scheduled" && entry.at > held.purgedAt && entry.outcome === "ok",
  );

  const consumer = found.find((entry) => entry.trigger === "queue" && entry.at > held.purgedAt);

  if (tick === undefined || consumer === undefined || consumer.at < tick.at) return false;

  findings.measure(
    "ms from the scheduled invocation to the first consumer invocation",
    consumer.at - tick.at,
  );

  findings.check(
    "the consumer invocation after it ended ok",
    consumer.outcome === "ok",
    consumer.outcome,
  );

  return true;
}

async function recovery(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
  attempt = 1,
): Promise<void> {
  await requireIdleCopy(run, copy);

  const held = await heldAndResumed(run, copy, findings, attempt);
  const item = await endState(copy, held.id);

  if (held.removed) {
    findings.check(
      "after the purge the Item was still processing and its job unclaimed",
      true,
      "processing queued",
    );
    findings.check("the Item ends ready", item.status === "ready", item.status);
    findings.check(
      "its fetch job is done",
      (await fetchJobs(run, held.id)).every((job) => job.state === "done"),
      "all jobs",
    );

    if (await orderOfInvocations(run, held, findings)) return;
  }

  if (attempt >= ATTEMPTS) {
    throw new Inconclusive(
      `the purge did not leave the job unclaimed, or a scheduled invocation fell before it completed, in ${String(ATTEMPTS)} attempts`,
    );
  }

  await recovery(run, copy, findings, attempt + 1);
}

export async function cronCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await awaitScheduledTick(run, findings);
  await recovery(run, copy, findings);
}
