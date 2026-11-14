import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  GROK_BOT_IN_FLIGHT,
  GROK_BOT_WEEKLY_RESERVE,
  ownerOf,
  startBotTask,
} from "../src/core/bot-task-start.ts";
import { applyOutcome } from "../src/core/job-finish.ts";
import type { ClaimedJob } from "../src/core/job-outcome.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  bulkJobs,
  chooseBotProvider,
  openJob,
  relatedLibrary,
  retireTasks,
  saveBot,
} from "./bot-task-fixtures.ts";
import { step } from "./bot-task-lifecycle.ts";
import { jobRow, taskRows } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const START = { kind: "related_pick", inputs: "{}", inputRevision: 1, context: "{}" } as const;

const SHARED_SLOTS = GROK_BOT_IN_FLIGHT - GROK_BOT_WEEKLY_RESERVE;

describe("no more than 10 Grok Bot tasks are outstanding, however the starts overlap", () => {
  let instance: Instance;
  let library: BotLibrary;

  const startAll = (jobs: readonly ClaimedJob[]) =>
    Promise.all(jobs.map((job) => startBotTask(instance.core, ownerOf(job), START)));

  const kindsOf = async (count: number, kind: string) =>
    (await startAll(await bulkJobs(instance, count, kind))).map(({ kind: outcome }) => outcome);

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
    chooseBotProvider(instance);
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  const running = () => taskRows(instance, "executor = 'grok-bot' and state = 'running'");

  const fillCap = async () => {
    const started = await startAll(await bulkJobs(instance, SHARED_SLOTS));

    assert.ok(started.every(({ kind }) => kind === "started"));
  };

  it("starts exactly 7 of 9 shared-kind tasks in two concurrent batches and answers the other two full", async () => {
    const jobs = await bulkJobs(instance, SHARED_SLOTS + 2);

    const [first, second] = await Promise.all([
      startAll(jobs.slice(0, 5)),
      startAll(jobs.slice(5)),
    ]);

    const kinds = [...first, ...second].map(({ kind }) => kind);

    assert.equal(kinds.filter((kind) => kind === "started").length, SHARED_SLOTS);
    assert.equal(kinds.filter((kind) => kind === "full").length, 2);
    assert.equal(running().length, SHARED_SLOTS);
  });

  it("keeps the last 3 places for the weekly runs and caps all kinds together at 10", async () => {
    await fillCap();

    assert.deepEqual(await kindsOf(1, "digest"), ["full"]);
    assert.deepEqual(await kindsOf(4, "proposals"), ["started", "started", "started", "full"]);
    assert.equal(running().length, GROK_BOT_IN_FLIGHT);
  });

  it("defers a job that finds the cap full with the grok-bot wait, 60 seconds and no attempt", async () => {
    await fillCap();

    const job = await openJob(instance, library.source, 1);
    const asked = Date.now();

    await applyOutcome(instance.core, job, await step(instance, job));

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

    assert.deepEqual(
      more.map(({ kind }) => kind),
      ["started", "started", "started", "started", "full"],
    );
  });

  it("starts a Digest while answered tasks wait on that Digest, however many there are", async () => {
    await fillCap();
    await kindsOf(GROK_BOT_WEEKLY_RESERVE, "proposals");
    assert.equal(running().length, GROK_BOT_IN_FLIGHT);
    exec(
      instance,
      "update ai_tasks set answered_at = ? where executor = 'grok-bot' and state = 'running'",
      Date.now(),
    );
    const [digest] = await bulkJobs(instance, 1, "digest");

    assert.ok(digest);
    assert.equal((await startBotTask(instance.core, ownerOf(digest), START)).kind, "started");
  });
});
