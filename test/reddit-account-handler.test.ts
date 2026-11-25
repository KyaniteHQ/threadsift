import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { executeClaimed, runJob } from "../src/core/compose/jobs.ts";
import { MAX_ATTEMPTS } from "../src/core/contract/job-contract.ts";
import type { ClaimedRow } from "../src/core/kernel/job-outcome.ts";
import { takeTurn } from "../src/features/reddit/core/reddit-account-queue.ts";
import { dueNow } from "./bot-task-rows.ts";
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
} from "./reddit-account-fixtures.ts";

const REDDIT_LINK = "https://www.reddit.com/comments/q1/";

const OTHER_LINK = "https://github.com/KyaniteHQ/threadsift";

describe("a fetch job reaches the Reddit queue through its handler", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await accountInstance();
    await connect(instance, SESSION);
    instance.database.exec("update reddit_account set queue_head = 2");
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
    instance.database.exec("update reddit_account set queue_head = null");
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
    dueNow(instance, 4);
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
