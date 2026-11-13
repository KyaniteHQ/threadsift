import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { VerifyResultSchema } from "../src/core/ai-contract.ts";
import { botInstance, pastDeadline } from "./bot-task-fixtures.ts";
import { answered, errorOf } from "./bot-task-http.ts";
import { taskRow, taskRows } from "./bot-task-rows.ts";
import {
  chooseGrokBot,
  occupyBot,
  sentVerifyTask,
  verifyingTask,
} from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";

const VERIFY_PATH = "/api/settings/ai/verify";

const ANSWER = {
  title: "Quasar lattice",
  topic: "Quasars",
  tags: ["quasar"],
  summary: "A short summary.",
  keyPoints: ["One point"],
  keptComments: [],
};

describe("Verify with Grok Bot waits for the answer the bot posts and reads the task row", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();

    assert.equal((await chooseGrokBot(instance)).status, 200);
  });

  after(() => instance.close());

  it("returns the Digest and completes the task when the bot answers while Verify waits", async () => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(instance, task);

    assert.equal((await answered(instance, task, { result: ANSWER })).status, 204);

    const verified = await result;

    assert.equal(verified.kind, "done");
    assert.equal(verified.kind === "done" ? verified.digest.title : null, ANSWER.title);
    assert.equal(taskRow(instance, task.id).state, "done");
    assert.equal(taskRow(instance, task.id).job_id, null);
  });

  it("refuses a result that is not a Digest with 400 and leaves the task open for another answer", async () => {
    const task = await sentVerifyTask(instance);

    const refused = await answered(instance, task, {
      result: { ...ANSWER, tags: ["a", "b", "c", "d"] },
    });

    assert.equal(refused.status, 400);
    assert.match(errorOf(refused.text), /tags/u);
    assert.equal((await answered(instance, task, { result: ANSWER })).status, 204);
  });

  it("returns the timeout when no answer comes before the deadline, and a late answer is 409", async () => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(instance, task);

    pastDeadline(instance, task.id);

    assert.deepEqual(await result, { kind: "refused", reason: "timeout", status: null });
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
    assert.equal((await answered(instance, task, { result: ANSWER })).status, 409);
  });

  it("closes a Verify task to answers after its own window, not after the hour a library task gets", async () => {
    const task = await sentVerifyTask(instance);
    const left = taskRow(instance, task.id).deadline - Date.now();

    assert.ok(left > 60_000 && left < 120_000, `the window left was ${String(left)} ms`);

    pastDeadline(instance, task.id);

    assert.equal((await answered(instance, task, { result: ANSWER })).status, 409);
    assert.equal(taskRow(instance, task.id).answered_at, null);
  });

  it("returns provider-busy when the bot answers with an error", async () => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(instance, task);

    assert.equal((await answered(instance, task, { error: "The routine failed" })).status, 204);
    assert.deepEqual(await result, { kind: "refused", reason: "provider-busy", status: null });
  });

  it("stops waiting and closes the task when the caller goes away", async () => {
    const task = await sentVerifyTask(instance);
    const caller = new AbortController();
    const { result } = await verifyingTask(instance, task, caller.signal);

    caller.abort();

    assert.equal((await result).kind, "refused");
    assert.equal(taskRow(instance, task.id).state, "failed");
  });

  it("through the route starts a task with no job and the Verify context, and shows the failed send", async () => {
    const known = taskRows(instance).length;
    const answer = await instance.send("POST", VERIFY_PATH);

    assert.equal(answer.status, 200);
    assert.deepEqual(VerifyResultSchema.parse(JSON.parse(answer.body)), {
      kind: "refused",
      reason: "unreachable",
      status: null,
    });

    const [started, ...rest] = taskRows(instance).slice(known);

    assert.deepEqual(rest, []);
    assert.deepEqual(
      [started?.executor, started?.job_id, started?.context, started?.state],
      ["grok-bot", null, '{"verify":true}', "failed"],
    );
  });

  it("through the route refuses with provider-busy and starts no task when the bot has no free place", async () => {
    occupyBot(instance, 7);

    const known = taskRows(instance).length;
    const answer = await instance.send("POST", VERIFY_PATH);

    assert.deepEqual(VerifyResultSchema.parse(JSON.parse(answer.body)), {
      kind: "refused",
      reason: "provider-busy",
      status: null,
    });
    assert.equal(taskRows(instance).length, known);
  });
});
