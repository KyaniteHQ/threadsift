import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { executeClaimed, runJob } from "../src/core/compose/jobs.ts";
import { MAX_ATTEMPTS } from "../src/core/contract/job-contract.ts";
import type { ClaimedRow } from "../src/core/kernel/job-outcome.ts";
import { takeTurn } from "../src/features/reddit/core/reddit-account-queue.ts";
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
  view,
  SESSION,
  account,
  claimedJob,
  connect,
  fetchJob,
  jobs,
} from "./reddit-account-fixtures.ts";
import { exec } from "./related-fixtures.ts";

const REDDIT_LINK = "https://www.reddit.com/comments/q1/";

const OTHER_LINK = "https://github.com/KyaniteHQ/threadsift";

describe("a fetch job reaches the Reddit queue through its handler", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await accountInstance();
    await connect(instance, SESSION);
    exec(instance, "update reddit_account set queue_head = 2");
  });

  afterEach(() => instance.close());

  async function holdingTheTurn(id: number): Promise<ClaimedRow> {
    const holder = await claimedJob(instance, id);

    assert.notEqual(await takeTurn(instance.core.db, holder, Date.now()), null);
    assert.equal(account(instance)[0]?.busy_job, id);

    return holder;
  }

  const waiting = (id: number) => {
    fetchJob(instance, id, { state: "queued", waitReason: "reddit-limit", dueAt: LATER });
  };

  const dueNow = (id: number) => {
    exec(instance, "update jobs set next_attempt_at = 0 where id = ?", id);
  };

  const spent = (id: number, address: string) => {
    fetchJob(instance, id, {
      state: "queued",
      waitReason: null,
      dueAt: LATER,
      address,
      attempts: MAX_ATTEMPTS,
    });
  };

  it("gives the turn up and wakes only the oldest waiting job when the Reddit job that holds it runs out of attempts", async () => {
    spent(1, REDDIT_LINK);
    waiting(2);
    waiting(3);

    const holder = await holdingTheTurn(1);

    await executeClaimed(instance.core, holder);

    assert.equal(account(instance)[0]?.busy_job, null);
    assert.deepEqual(
      jobs(instance).map(({ id, next_attempt_at }) => [id, next_attempt_at < LATER]),
      [
        [1, false],
        [2, true],
        [3, false],
      ],
    );
  });

  it("queues behind the holder, and points the head at itself, when a Reddit job finds the turn taken", async () => {
    fetchJob(instance, 1, { state: "queued", waitReason: null, dueAt: LATER });
    fetchJob(instance, 3, { state: "queued", waitReason: null, dueAt: 0, address: REDDIT_LINK });
    await holdingTheTurn(1);
    exec(instance, "update reddit_account set queue_head = null");
    await runJob(instance.core, 3);

    const [, job] = jobs(instance);

    assert.deepEqual([job?.id, job?.state, job?.wait_reason], [3, "queued", "reddit-limit"]);
    assert.deepEqual([account(instance)[0]?.busy_job, account(instance)[0]?.queue_head], [1, 3]);
  });

  it("leaves the turn and the waiting jobs alone when a job of another source runs out of attempts", async () => {
    fetchJob(instance, 1, { state: "queued", waitReason: null, dueAt: LATER });
    waiting(2);
    spent(4, OTHER_LINK);
    await holdingTheTurn(1);
    dueNow(4);
    await runJob(instance.core, 4);

    assert.deepEqual(
      jobs(instance).map(({ id, state, next_attempt_at }) => [
        id,
        state,
        next_attempt_at === LATER,
      ]),
      [
        [1, "running", true],
        [2, "queued", true],
        [4, "done", false],
      ],
    );
    assert.deepEqual([account(instance)[0]?.busy_job, account(instance)[0]?.queue_head], [1, 2]);
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
    assert.notEqual(await take(NOW), null);
    await record({ left: 0, reset: "300", retryAfter: null, limited: false });
    await waitsUntil(NOW + 300_000);
  });

  it("waits at least 60 seconds after a 429 with a shorter Retry-After", async () => {
    await record({ left: 9, reset: "0", retryAfter: "59", limited: true });
    await waitsUntil(NOW + 60_000);
  });

  it("honours the longest 429 delay, caps Retry-After at one hour and waits for an exhausted window to reset", async () => {
    const delay = async (reset: string, retryAfter: string | null, wait: number) => {
      await record({ left: null, reset, retryAfter, limited: true });
      await waitsUntil(NOW + wait);
    };
    await delay("120", "300", 300_000);
    await delay("900", "Wed, 21 Oct 2026 07:28:00 GMT", 900_000);
    await delay("120", new Date(NOW + 1_200_000).toUTCString(), 1_200_000);
    await delay("120", "86400", 3_600_000);
    await delay("86400", null, 86_400_000);
  });

  const refuse = (thread: string) =>
    countRefusal(instance.core, session, { thread, startedAt: NOW }, NOW);

  it("expires the session on the third distinct refused thread and then refuses the turn", async () => {
    await refuse("aaa111");
    await refuse("aaa111");
    await refuse("bbb222");
    await refuse("aaa111");
    assert.equal((await view(instance)).state, "connected");
    assert.notEqual(await take(NOW), null);
    await refuse("ccc333");
    assert.equal((await view(instance)).state, "expired");
    assert.ok((await take(NOW)) === null);
  });

  it("starts the count again after an answer that shows the session works", async () => {
    await refuse("aaa111");
    await refuse("bbb222");
    await clearRefusals(instance.core.db, session, NOW);
    await refuse("ccc333");
    await refuse("ddd444");
    assert.equal((await view(instance)).state, "connected");
    assert.notEqual(await take(NOW), null);
    await refuse("eee555");
    assert.equal((await view(instance)).state, "expired");
  });
});
