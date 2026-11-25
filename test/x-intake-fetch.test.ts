import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { executeClaimed, runJob } from "../src/core/compose/jobs.ts";
import { saveBot } from "./bot-task-fixtures.ts";
import { dueNow } from "./bot-task-rows.ts";
import { atClock } from "./clock-fixtures.ts";
import { Instance, SECRET_KEY } from "./instance.ts";
import { xAddressOf, claimedFetchJob, insertedXItem } from "./x-intake-fixtures.ts";
import { X_LINK } from "./x-thread-fixtures.ts";

const TaskSchema = z.object({ state: z.string(), refusal: z.string().nullable() });

const JobSchema = z.object({
  id: z.number(),
  state: z.string(),
  attempts: z.number(),
  next_attempt_at: z.number(),
});

const savedId = (body: string): number =>
  z.object({ item: z.object({ id: z.number() }) }).parse(JSON.parse(body)).item.id;

const tasks = (instance: Instance) =>
  instance.database.rows(
    TaskSchema,
    "select state, refusal from ai_tasks where kind = 'x_intake' order by id",
  );

const fetchJob = (instance: Instance) => {
  const [job] = instance.database.rows(
    JobSchema,
    "select id, state, attempts, next_attempt_at from jobs where kind = 'fetch'",
  );

  assert.ok(job !== undefined);

  return job;
};

describe("an X link stays Link-only until a Grok Bot is saved", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("keeps the link Link-only without sending a task, with no note under auto and bot-not-set-up when the owner chooses the unconfigured bot", async () => {
    const saved = await instance.send("POST", "/api/items", { url: X_LINK });
    const id = savedId(saved.body);

    const item = await instance.settledItem(id);
    assert.equal(item.status, "ready");
    assert.equal(item.fetch, "not-requested");
    assert.equal((await instance.detail(id)).xNote, null);
    assert.equal(
      (await instance.send("PUT", "/api/settings/x", { reader: "grok-bot" })).status,
      200,
    );
    const chosen = await instance.send("POST", "/api/items", {
      url: "https://x.com/someone/status/321",
    });
    const chosenId = savedId(chosen.body);
    await instance.settledItem(chosenId);
    assert.equal((await instance.detail(chosenId)).xNote, "bot-not-set-up");
    assert.deepEqual(tasks(instance), []);
  });
});

describe("an X link goes to the saved Grok Bot first, and a send that fails is retried three times", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
  });

  after(() => instance.close());

  it("starts one task per send, retries after 30 seconds and 2 minutes, and ends the Item failed with gave-up", async () => {
    const statusId = "321";
    const id = insertedXItem(instance, statusId);
    const job = await claimedFetchJob(instance, id, xAddressOf(statusId));
    const firstAttempt = Date.now();
    await atClock(
      () => firstAttempt,
      () => executeClaimed(instance.core, job),
    );
    const first = fetchJob(instance);
    assert.equal(first.attempts, 1);
    assert.equal(first.state, "queued");
    assert.equal(first.next_attempt_at - firstAttempt, 30_000);
    assert.deepEqual(tasks(instance), [{ state: "failed", refusal: "unreachable" }]);
    assert.equal((await instance.detail(id)).status, "processing");

    dueNow(instance, first.id);
    const secondAttempt = Date.now();
    await atClock(
      () => secondAttempt,
      () => runJob(instance.core, first.id),
    );

    const second = fetchJob(instance);

    assert.equal(second.attempts, 2);
    assert.equal(second.next_attempt_at - secondAttempt, 120_000);

    dueNow(instance, first.id);
    await runJob(instance.core, first.id);

    const detail = await instance.detail(id);

    assert.equal(fetchJob(instance).state, "done");
    assert.deepEqual([detail.status, detail.reason], ["failed", "gave-up"]);
    assert.deepEqual(
      tasks(instance),
      Array.from({ length: 3 }, () => ({ state: "failed", refusal: "unreachable" })),
    );
  });
});
