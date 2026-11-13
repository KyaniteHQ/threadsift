import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { runJob } from "../src/core/jobs.ts";
import { SECRET_KEY, saveBot } from "./bot-task-fixtures.ts";
import { Instance } from "./instance.ts";
import { exec, rows, until } from "./related-fixtures.ts";
import { itemRow } from "./x-intake-rows.ts";
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
  rows(
    instance,
    TaskSchema,
    "select state, refusal from ai_tasks where kind = 'x_intake' order by id",
  );

const fetchJob = (instance: Instance) => {
  const [job] = rows(
    instance,
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

  it("settles the link with fetch result not-requested and sends no task", async () => {
    const saved = await instance.send("POST", "/api/items", { url: X_LINK });
    const id = savedId(saved.body);

    assert.equal((await instance.settledItem(id)).status, "ready");
    assert.equal(itemRow(instance, id).fetch_result, "not-requested");
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
    const saved = await instance.send("POST", "/api/items", { url: X_LINK });
    const id = savedId(saved.body);

    const first = await until(
      () => fetchJob(instance),
      ({ attempts }) => attempts === 1,
    );

    assert.equal(first.state, "queued");
    assert.ok(first.next_attempt_at - Date.now() > 25_000);
    assert.ok(first.next_attempt_at - Date.now() <= 30_000);
    assert.deepEqual(tasks(instance), [{ state: "failed", refusal: "unreachable" }]);
    assert.equal((await instance.detail(id)).status, "processing");

    exec(instance, "update jobs set next_attempt_at = 0 where id = ?", first.id);
    await runJob(instance.core, first.id);

    const second = fetchJob(instance);

    assert.equal(second.attempts, 2);
    assert.ok(second.next_attempt_at - Date.now() > 110_000);
    assert.ok(second.next_attempt_at - Date.now() <= 120_000);

    exec(instance, "update jobs set next_attempt_at = 0 where id = ?", first.id);
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
