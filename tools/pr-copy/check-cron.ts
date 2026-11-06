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
import { type Copy, callCopy, endState, expectOk, paste, send } from "./copy-client.ts";
import { purgeCompleted, resumeDelivery, setDeliveryPaused, startPurge } from "./copy-control.ts";
import { awaitInvocations } from "./telemetry.ts";

const CRON_WAIT_MS = 20 * 60_000;
const PURGE_DEADLINE_MS = 120_000;
const PURGE_POLL_MS = 2000;
const LINK = "https://example.com/";

async function awaitPurge(run: Readonly<Run>, deadline: number): Promise<number> {
  if (await purgeCompleted(run.stage, run.stage.target.queue)) return Date.now();

  if (Date.now() >= deadline)
    throw new Inconclusive("the purge did not complete before its deadline");

  await sleep(PURGE_POLL_MS);

  return awaitPurge(run, deadline);
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
}

async function holdAndPurge(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<Held> {
  const { stage } = run;
  await setDeliveryPaused(stage, stage.target.queue, true);

  const pastedAt = Date.now();
  const id = await paste(copy, withTag(LINK, `${run.tag}-cron`));
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

  await startPurge(stage, stage.target.queue);
  const purgedAt = await awaitPurge(run, Date.now() + PURGE_DEADLINE_MS);

  const path = `/api/items/${String(id)}/status`;
  const response = await callCopy(copy, { path, cookie: copy.cookie });
  await expectOk(response, path);
  const item = ItemResponseSchema.parse(await response.json()).item;
  const after = await fetchJobs(run, id);

  findings.check(
    "after the purge the Item is still processing and its job is unclaimed",
    item.status === "processing" && after.length === 1 && after[0]?.state === "queued",
    `${item.status} ${after.map((job) => job.state).join(",")}`,
  );

  const resumedAt = Date.now();
  await setDeliveryPaused(stage, stage.target.queue, false);

  return { id, pastedAt, purgedAt, resumedAt };
}

async function heldAndResumed(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<Held> {
  try {
    return await holdAndPurge(run, copy, findings);
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
): Promise<void> {
  const found = await recoveryInvocations(run, held);
  findings.used(found);

  const tick = found.find(
    (entry) => entry.trigger === "scheduled" && entry.at > held.purgedAt && entry.outcome === "ok",
  );

  const consumer = found.find((entry) => entry.trigger === "queue" && entry.at > held.purgedAt);

  if (tick === undefined || consumer === undefined) {
    throw new Inconclusive("no scheduled invocation and consumer invocation followed the purge");
  }

  if (consumer.at < tick.at) {
    throw new Inconclusive(
      "a consumer invocation came before the next scheduled invocation, so the purge may not have removed the message",
    );
  }

  findings.check(
    "the scheduled invocation came before the first consumer invocation after the purge",
    tick.at < consumer.at,
    `${String(consumer.at - tick.at)} ms apart`,
  );
  findings.check(
    "the consumer invocation after it ended ok",
    consumer.outcome === "ok",
    consumer.outcome,
  );
}

export async function cronCheck(
  run: Readonly<Run>,
  copy: Readonly<Copy>,
  findings: Readonly<Findings>,
): Promise<void> {
  await awaitScheduledTick(run, findings);
  await requireIdleCopy(run, copy);

  const held = await heldAndResumed(run, copy, findings);
  const item = await endState(copy, held.id);

  findings.check("the Item ends ready", item.status === "ready", item.status);
  findings.check(
    "its fetch job is done",
    (await fetchJobs(run, held.id)).every((job) => job.state === "done"),
    "all jobs",
  );

  await orderOfInvocations(run, held, findings);
}
