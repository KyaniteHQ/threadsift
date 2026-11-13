import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { eq } from "drizzle-orm";

import { fetchHandler } from "../src/core/fetch-job.ts";
import type { Closing } from "../src/core/job-outcome.ts";
import { takeTurn } from "../src/core/reddit-account-queue.ts";
import { jobs as jobsTable } from "../src/core/schema.ts";
import { Instance } from "./instance.ts";
import {
  LATER,
  SECRET_KEY,
  SESSION,
  account,
  connect,
  fetchJob,
  jobs,
} from "./reddit-account-fixtures.ts";
import { exec } from "./related-fixtures.ts";

const HOUR_MS = 3_600_000;

const REDDIT_LINK = "https://www.reddit.com/comments/q1/";

const OTHER_LINK = "https://github.com/KyaniteHQ/threadsift";

const WAIT_FOR_REDDIT: Closing = { kind: "deferred", wait: "reddit-limit" };

describe("one fill takes the Reddit account at a time, oldest first", () => {
  let instance: Instance;

  const database = () => instance.core.db;

  async function closing(id: number, how: Closing, address = REDDIT_LINK): Promise<void> {
    const [row] = await database().select().from(jobsTable).where(eq(jobsTable.id, id));

    assert.ok(row !== undefined);

    const writes = fetchHandler.closing?.(database(), { ...row, address }, how) ?? [];
    const [first, ...rest] = writes;

    if (first !== undefined) await database().batch([first, ...rest]);
  }

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  beforeEach(async () => {
    exec(instance, "delete from reddit_account");
    exec(instance, "delete from jobs");
    exec(instance, "delete from items");
    await connect(instance, SESSION);
    fetchJob(instance, 1, { state: "queued", waitReason: null, dueAt: LATER });
    fetchJob(instance, 2, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 3, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    await closing(3, WAIT_FOR_REDDIT);
    await closing(2, WAIT_FOR_REDDIT);
  });

  after(() => instance.close());

  it("refuses a younger job while an older one waits, and lets the oldest waiting job take the turn", async () => {
    const now = Date.now();

    assert.equal(await takeTurn(database(), 3, now), null);
    assert.notEqual(await takeTurn(database(), 2, now), null);
  });

  it("keeps the order while the oldest waiting job is being claimed", async () => {
    exec(instance, "update jobs set state = 'running', wait_reason = null where id = 2");

    const now = Date.now();

    assert.equal(await takeTurn(database(), 3, now), null);
    assert.notEqual(await takeTurn(database(), 2, now), null);
  });

  it("holds the turn for the job that has it and refuses every other job until it ends", async () => {
    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 1, now), null);
    assert.notEqual(await takeTurn(database(), 1, now), null);
    assert.equal(await takeTurn(database(), 2, now), null);
    assert.equal(await takeTurn(database(), 3, now), null);
    assert.equal(account(instance)[0]?.busy_job, 1);
  });

  it("gives the turn to another job once the holder's claim has run out", async () => {
    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 1, now), null);
    assert.notEqual(await takeTurn(database(), 2, now + HOUR_MS), null);
  });

  it("gives the turn to another job once the holder's job is closed or gone", async () => {
    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 1, now), null);
    exec(instance, "update jobs set state = 'done' where id = 1");
    assert.notEqual(await takeTurn(database(), 2, now), null);

    exec(instance, "delete from jobs where id = 2");
    assert.notEqual(await takeTurn(database(), 3, now), null);
  });

  it("frees the turn when its job is deferred, and keeps the waiting jobs behind each other", async () => {
    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 1, now), null);
    await closing(1, { kind: "deferred", wait: null });

    assert.equal(account(instance)[0]?.busy_job, null);
    assert.equal(await takeTurn(database(), 3, now), null);
  });

  it("keeps the holder's turn when another job is deferred", async () => {
    assert.notEqual(await takeTurn(database(), 1, Date.now()), null);
    await closing(3, WAIT_FOR_REDDIT);

    assert.equal(account(instance)[0]?.busy_job, 1);
  });

  it("keeps an older head that is being claimed when a younger job is deferred", async () => {
    exec(instance, "update jobs set state = 'running', wait_reason = null where id = 2");
    fetchJob(instance, 4, { state: "queued", waitReason: null, dueAt: LATER });
    await closing(4, WAIT_FOR_REDDIT);

    assert.equal(account(instance)[0]?.queue_head, 2);
  });

  it("lets the next job through once the job at the head of the queue is done or gone", async () => {
    const now = Date.now();

    exec(instance, "update jobs set state = 'done' where id = 2");
    assert.notEqual(await takeTurn(database(), 3, now), null);

    exec(instance, "update reddit_account set busy_until = null, busy_job = null");
    exec(instance, "delete from jobs where id = 3");
    assert.notEqual(await takeTurn(database(), 1, now), null);
  });

  it("points the head at the next waiting job when the oldest takes the turn", async () => {
    fetchJob(instance, 4, { state: "queued", waitReason: null, dueAt: LATER });

    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 2, now), null);
    assert.equal(account(instance)[0]?.queue_head, 3);

    exec(instance, "update jobs set state = 'done' where id = 2");
    exec(instance, "update reddit_account set busy_until = null, busy_job = null");
    assert.equal(await takeTurn(database(), 4, now), null);
    assert.notEqual(await takeTurn(database(), 3, now), null);
  });

  it("keeps the oldest waiting job as the head of the queue, and moves the head when that job is done", async () => {
    assert.equal(account(instance)[0]?.queue_head, 2);

    await closing(1, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 1);

    exec(instance, "update jobs set state = 'done' where id = 1");
    await closing(3, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 2);

    exec(instance, "update jobs set state = 'done' where id = 2");
    await closing(3, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 3);
  });

  it("wakes only the oldest waiting job when the job that held the turn is closed, and frees the turn", async () => {
    const now = Date.now();

    assert.notEqual(await takeTurn(database(), 1, now), null);
    await closing(1, { kind: "closed" });

    assert.equal(account(instance)[0]?.busy_job, null);
    assert.deepEqual(
      jobs(instance).map(({ id, next_attempt_at }) => [id, next_attempt_at < LATER]),
      [
        [1, false],
        [2, true],
        [3, false],
      ],
    );
    assert.equal(await takeTurn(database(), 3, now), null);
    assert.notEqual(await takeTurn(database(), 2, now), null);
  });

  it("wakes no job when the job that is closed never held the turn", async () => {
    assert.notEqual(await takeTurn(database(), 1, Date.now()), null);
    await closing(3, { kind: "closed" });

    assert.equal(account(instance)[0]?.busy_job, 1);
    assert.ok(jobs(instance).every((job) => job.next_attempt_at === LATER));
  });

  it("runs no Reddit statement when the job closed is a fetch of another source", async () => {
    const [row] = await database().select().from(jobsTable).where(eq(jobsTable.id, 1));

    assert.ok(row !== undefined);
    assert.equal(
      fetchHandler.closing?.(database(), { ...row, address: OTHER_LINK }, { kind: "closed" })
        .length,
      0,
    );
    assert.equal(
      fetchHandler.closing?.(database(), { ...row, address: OTHER_LINK }, WAIT_FOR_REDDIT).length,
      0,
    );
    assert.ok(
      (fetchHandler.closing?.(database(), { ...row, address: REDDIT_LINK }, { kind: "closed" })
        .length ?? 0) > 0,
    );
  });

  it("gives no turn while Reddit limits the account, and gives it back at the end of the limit", async () => {
    const now = Date.now();

    exec(instance, "update reddit_account set limited_until = ?", now + HOUR_MS);
    assert.equal(await takeTurn(database(), 2, now), null);
    assert.notEqual(await takeTurn(database(), 2, now + 2 * HOUR_MS), null);
  });

  it("gives no turn while the request window is used up, and gives it back at its reset", async () => {
    const now = Date.now();

    exec(
      instance,
      "update reddit_account set window_remaining = 0, window_resets_at = ?",
      now + 60_000,
    );
    assert.equal(await takeTurn(database(), 2, now), null);
    assert.notEqual(await takeTurn(database(), 2, now + 120_000), null);

    exec(
      instance,
      "update reddit_account set busy_until = null, busy_job = null, window_remaining = 3, window_resets_at = ?",
      now + 60_000,
    );
    assert.notEqual(await takeTurn(database(), 2, now), null);
  });

  it("gives no turn once the session expired or the account is gone", async () => {
    const now = Date.now();

    exec(instance, "update reddit_account set state = 'expired'");
    assert.equal(await takeTurn(database(), 2, now), null);

    exec(instance, "delete from reddit_account");
    assert.equal(await takeTurn(database(), 2, now), null);
  });
});
