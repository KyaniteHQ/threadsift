import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { HOUR_MS } from "../src/core/contract/time-units.ts";
import type { ClaimedRow, Closing } from "../src/core/kernel/job-outcome.ts";
import { redditClosing, takeTurn } from "../src/features/reddit/core/reddit-account-queue.ts";
import {
  type AccountSession,
  clearRefusals,
  countRefusal,
  recordWindow,
} from "../src/features/reddit/core/reddit-account-states.ts";
import type { Instance } from "./instance.ts";
import {
  LATER,
  accountInstance,
  SESSION,
  account,
  claimedJob,
  connect,
  fetchJob,
  jobs,
  view,
} from "./reddit-account-fixtures.ts";

const WAIT_FOR_REDDIT: Closing = { kind: "deferred", wait: "reddit-limit" };

describe("one fill takes the Reddit account at a time, oldest first", () => {
  let instance: Instance;

  const database = () => instance.core.db;

  const claims = new Map<number, ClaimedRow>();

  async function claimed(id: number): Promise<ClaimedRow> {
    const held = claims.get(id) ?? (await claimedJob(instance, id));

    claims.set(id, held);

    return held;
  }

  async function closing(id: number, how: Closing): Promise<void> {
    const [first, ...rest] = redditClosing(database(), await claimed(id), how);

    if (first !== undefined) await database().batch([first, ...rest]);
  }

  async function take(id: number, now: number) {
    return takeTurn(database(), await claimed(id), now);
  }

  before(async () => {
    instance = await accountInstance();
  });

  beforeEach(async () => {
    claims.clear();
    instance.database.exec("delete from reddit_account");
    instance.database.exec("delete from jobs");
    instance.database.exec("delete from items");
    await connect(instance, SESSION);
    fetchJob(instance, 1, { state: "queued", waitReason: null, dueAt: LATER });
    fetchJob(instance, 2, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    fetchJob(instance, 3, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
    instance.database.exec("update reddit_account set queue_head = 2");
    instance.database.exec("update jobs set next_attempt_at = ?", LATER);
  });

  after(() => instance.close());

  it("refuses a younger job while an older one waits, and lets the oldest waiting job take the turn", async () => {
    const now = Date.now();

    assert.equal(await take(3, now), null);
    assert.notEqual(await take(2, now), null);
  });

  it("keeps the order while the oldest waiting job is being claimed", async () => {
    await claimed(2);

    const now = Date.now();

    assert.equal(await take(3, now), null);
    assert.notEqual(await take(2, now), null);
  });

  it("holds the turn for the job that has it and refuses every other job until it ends", async () => {
    const now = Date.now();

    assert.notEqual(await take(1, now), null);
    assert.notEqual(await take(1, now), null);
    assert.equal(await take(2, now), null);
    assert.equal(await take(3, now), null);
    assert.equal(account(instance)[0]?.busy_job, 1);
  });

  it("gives the turn to another job once the holder's claim has run out", async () => {
    const now = Date.now();

    assert.notEqual(await take(1, now), null);
    assert.notEqual(await take(2, now + HOUR_MS), null);
  });

  it("keeps the turn of a holder whose job is closed or gone until its run ends", async () => {
    const now = Date.now();

    assert.notEqual(await take(1, now), null);
    instance.database.exec("update jobs set state = 'done' where id = 1");
    assert.equal(await take(2, now), null);

    await closing(1, { kind: "closed" });
    assert.equal(await take(3, now), null);
    assert.equal(account(instance)[0]?.busy_job, null);
    assert.notEqual(await take(2, now), null);

    instance.database.exec("delete from jobs where id = 2");
    assert.equal(await take(3, now), null);
  });

  it("frees the turn when its job is deferred, and keeps the waiting jobs behind each other", async () => {
    const now = Date.now();

    assert.notEqual(await take(1, now), null);
    await closing(1, { kind: "deferred", wait: null });

    assert.equal(account(instance)[0]?.busy_job, null);
    assert.equal(await take(3, now), null);
  });

  it("keeps the holder's turn when another job is deferred", async () => {
    assert.notEqual(await take(1, Date.now()), null);
    await closing(3, WAIT_FOR_REDDIT);

    assert.equal(account(instance)[0]?.busy_job, 1);
  });

  it("keeps an older head that is being claimed when a younger job is deferred", async () => {
    await claimed(2);
    fetchJob(instance, 4, { state: "queued", waitReason: null, dueAt: LATER });
    await closing(4, WAIT_FOR_REDDIT);

    assert.equal(account(instance)[0]?.queue_head, 2);
  });

  it("lets the next job through once the job at the head of the queue is done", async () => {
    assert.equal(account(instance)[0]?.queue_head, 2);
    instance.database.exec("update jobs set state = 'done' where id = 2");

    assert.notEqual(await take(3, Date.now()), null);
  });

  it("lets the next job through once the job at the head of the queue is gone", async () => {
    assert.equal(account(instance)[0]?.queue_head, 2);
    instance.database.exec("delete from jobs where id = 2");

    assert.notEqual(await take(3, Date.now()), null);
  });

  it("points the head at the next waiting job when the oldest takes the turn", async () => {
    fetchJob(instance, 4, { state: "queued", waitReason: null, dueAt: LATER });

    const now = Date.now();

    assert.notEqual(await take(2, now), null);
    assert.equal(account(instance)[0]?.queue_head, 3);

    instance.database.exec("update jobs set state = 'done' where id = 2");
    instance.database.exec("update reddit_account set busy_until = null, busy_job = null");
    assert.equal(await take(4, now), null);
    assert.notEqual(await take(3, now), null);
  });

  it("keeps the oldest waiting job as the head of the queue, and moves the head when that job is done", async () => {
    assert.equal(account(instance)[0]?.queue_head, 2);

    await closing(1, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 1);

    instance.database.exec("update jobs set state = 'done' where id = 1");
    await closing(3, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 2);

    instance.database.exec("update jobs set state = 'done' where id = 2");
    await closing(3, WAIT_FOR_REDDIT);
    assert.equal(account(instance)[0]?.queue_head, 3);
  });

  it("wakes no job when the job that is closed never held the turn", async () => {
    assert.notEqual(await take(1, Date.now()), null);
    await closing(3, { kind: "closed" });

    assert.equal(account(instance)[0]?.busy_job, 1);
    assert.ok(jobs(instance).every((job) => job.next_attempt_at === LATER));
  });

  it("gives no turn once the session expired or the account is gone", async () => {
    const now = Date.now();

    instance.database.exec("update reddit_account set state = 'expired'");
    assert.equal(await take(2, now), null);

    instance.database.exec("delete from reddit_account");
    assert.equal(await take(2, now), null);
  });
});

const NOW = 1_800_000_000_000;

describe("Reddit answers decide when a fetch job may take its next turn", () => {
  let instance: Instance;
  let job: ClaimedRow;
  let session: AccountSession;

  beforeEach(async () => {
    instance = await accountInstance();
    await connect(instance, SESSION);
    fetchJob(instance, 1, { state: "queued", waitReason: null, dueAt: LATER });
    job = await claimedJob(instance, 1);
    const [row] = account(instance);
    assert.ok(row);
    session = { sealedSession: row.sealed_session };
  });
  afterEach(() => instance.close());

  const record = (change: Parameters<typeof recordWindow>[2]) =>
    recordWindow(instance.core.db, session, change, NOW);

  const take = (now: number) => takeTurn(instance.core.db, job, now);

  const waitsUntil = async (end: number) => {
    assert.ok((await take(end - 1)) === null);
    assert.notEqual(await take(end), null);
  };

  it("allows a turn with requests left and waits for the reset when the window is empty", async () => {
    await record({ left: 42, reset: "300", retryAfter: null, limited: false });
    assert.equal((await take(NOW))?.lastRequestAt, NOW);
    await record({ left: 0.5, reset: "300", retryAfter: null, limited: false });
    await waitsUntil(NOW + 300_000);
  });

  it("waits at least 60 seconds after a 429 with a shorter Retry-After", async () => {
    await record({ left: 9, reset: "0", retryAfter: "59", limited: true });
    await waitsUntil(NOW + 60_000);
  });

  it("honours the longest 429 delay, and caps Retry-After and the window reset at one hour", async () => {
    const delay = async (reset: string, retryAfter: string | null, wait: number) => {
      await record({ left: null, reset, retryAfter, limited: true });
      await waitsUntil(NOW + wait);
    };
    await delay("120", "300", 300_000);
    await delay("900", "Wed, 21 Oct 2026 07:28:00 GMT", 900_000);
    await delay("120", new Date(NOW + 1_200_000).toUTCString(), 1_200_000);
    await delay("120", "86400", HOUR_MS);
    await delay("86400", null, HOUR_MS);
    await record({ left: 5, reset: null, retryAfter: null, limited: false });
    await waitsUntil(NOW + HOUR_MS);
  });

  const refuse = (thread: string) =>
    countRefusal(instance.core, session, { thread, startedAt: NOW }, NOW);

  it("expires the session on the third distinct refused thread and then refuses the turn", async () => {
    assert.equal(await refuse("aaa111"), "counted");
    assert.equal(await refuse("aaa111"), "counted");
    assert.equal(await refuse("bbb222"), "counted");
    assert.equal(await refuse("aaa111"), "counted");
    assert.equal((await view(instance)).state, "connected");
    assert.notEqual(await take(NOW), null);
    assert.equal(await refuse("ccc333"), "expired");
    assert.equal((await view(instance)).state, "expired");
    assert.ok((await take(NOW)) === null);
  });

  it("starts the count again after an answer that shows the session works", async () => {
    assert.equal(await refuse("aaa111"), "counted");
    assert.equal(await refuse("bbb222"), "counted");
    await clearRefusals(instance.core.db, session, NOW);
    assert.equal(await refuse("ccc333"), "counted");
    assert.equal(await refuse("ddd444"), "counted");
    assert.equal((await view(instance)).state, "connected");
    assert.notEqual(await take(NOW), null);
    assert.equal(await refuse("eee555"), "expired");
    assert.equal((await view(instance)).state, "expired");
  });
});
