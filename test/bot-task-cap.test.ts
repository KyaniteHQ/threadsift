import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { applyOutcome } from "../src/core/compose/job-finish.ts";
import { HANDLERS } from "../src/core/compose/job-handlers.ts";
import type { JobKind } from "../src/core/contract/job-contract.ts";
import type { ClaimedJob } from "../src/core/kernel/job-outcome.ts";
import { ownerOf, startBotTask } from "../src/features/ai/core/bot-task-start.ts";
import {
  type BotLibrary,
  GROK_BOT_IN_FLIGHT,
  SECRET_KEY,
  bulkJobs,
  openJob,
  relatedLibrary,
  retireTasks,
  saveBot,
  selectGrokBot,
} from "./bot-task-fixtures.ts";
import { step } from "./bot-task-lifecycle.ts";
import { jobRow, taskRows } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const START = { inputs: "{}", inputRevision: 1, context: "{}" } as const;

describe("one cap bounds outstanding Grok Bot tasks, however the starts overlap", () => {
  let instance: Instance;
  let library: BotLibrary;

  const startAll = (jobs: readonly ClaimedJob[], kind: JobKind = "related_pick") =>
    Promise.all(jobs.map((job) => startBotTask(instance.core, ownerOf(job), { ...START, kind })));

  const kindsOf = async (count: number, kind: JobKind) =>
    (await startAll(await bulkJobs(instance, count, kind), kind)).map(
      ({ kind: outcome }) => outcome,
    );

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
    await selectGrokBot(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  const running = () => taskRows(instance, "executor = 'grok-bot' and state = 'running'");

  const fillCap = async () => {
    const started = await startAll(await bulkJobs(instance, GROK_BOT_IN_FLIGHT));

    assert.ok(started.every(({ kind }) => kind === "started"));
  };

  it("caps all task kinds together", async () => {
    assert.deepEqual(await kindsOf(3, "digest"), ["started", "started", "started"]);
    assert.deepEqual(await kindsOf(3, "topic_overview"), ["started", "started", "started"]);

    assert.deepEqual((await kindsOf(5, "proposals")).toSorted(), [
      "full",
      "started",
      "started",
      "started",
      "started",
    ]);
    assert.deepEqual(await kindsOf(1, "digest"), ["full"]);
    const tasks = running();
    assert.equal(tasks.length, GROK_BOT_IN_FLIGHT);
    assert.deepEqual(
      new Set(tasks.map(({ kind }) => kind)),
      new Set(["digest", "proposals", "topic_overview"]),
    );
  });

  it("defers a job that finds the cap full with the grok-bot wait, 60 seconds and no attempt", async () => {
    await fillCap();

    const job = await openJob(instance, library.source, 1);
    const asked = Date.now();

    await applyOutcome(instance.core, job, await step(instance, job), HANDLERS[job.kind]);

    const row = jobRow(instance, job.id);

    assert.deepEqual([row.state, row.attempts, row.wait_reason], ["queued", 1, "grok-bot"]);
    assert.ok(row.next_attempt_at >= asked + 59_000 && row.next_attempt_at <= asked + 62_000);
    assert.deepEqual(taskRows(instance, "job_id = ?", job.id), []);
  });

  it("frees a place for a done task, a failed task, an answered task and an unanswered task past its deadline", async () => {
    await fillCap();

    const [done, failed, expired, answered] = running().map(({ id }) => id);

    exec(instance, "update ai_tasks set state = 'done' where id = ?", done ?? 0);
    exec(
      instance,
      "update ai_tasks set state = 'failed', refusal = 'timeout' where id = ?",
      failed ?? 0,
    );
    exec(
      instance,
      "update ai_tasks set deadline = ? where id = ?",
      Date.now() - 1000,
      expired ?? 0,
    );
    exec(
      instance,
      "update ai_tasks set answered_at = ? where id = ?",
      Date.now() - 2000,
      answered ?? 0,
    );
    const more = await startAll(await bulkJobs(instance, 5));

    assert.deepEqual(more.map(({ kind }) => kind).toSorted(), [
      "full",
      "started",
      "started",
      "started",
      "started",
    ]);
  });
});
