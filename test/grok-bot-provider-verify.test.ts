import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { VerifyResultSchema } from "../src/core/contract/ai-settings-contract.ts";
import {
  botInstance,
  pastDeadline,
  GROK_BOT_IN_FLIGHT,
  chooseGrokBot,
} from "./bot-task-fixtures.ts";
import { answered, errorOf } from "./bot-task-http.ts";
import { taskRow, taskRows } from "./bot-task-rows.ts";
import { exportedZip, savedLibrary } from "./export-restore-fixtures.ts";
import {
  VERIFY_PATH,
  occupyBot,
  VERIFY_ANSWER,
  sentVerifyTask,
  verifyingTask,
} from "./grok-bot-provider-fixtures.ts";
import { Instance } from "./instance.ts";
import { restoredDone, startedRestore } from "./restore-fixtures.ts";

describe("Verify with Grok Bot waits for the answer the bot posts and reads the task row", () => {
  let instance: Instance;

  before(async () => {
    instance = await botInstance();

    assert.equal((await chooseGrokBot(instance)).status, 200);
  });

  after(() => instance.close());

  it("returns the Digest and completes the task when the bot answers while Verify waits", async (t) => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(t, instance, task);

    assert.equal((await answered(instance, task, { result: VERIFY_ANSWER })).status, 204);

    const verified = await result;

    assert.equal(verified.kind, "done");
    assert.equal(verified.kind === "done" ? verified.digest.title : null, VERIFY_ANSWER.title);
    assert.equal(taskRow(instance, task.id).state, "done");
    assert.equal(taskRow(instance, task.id).job_id, null);
  });

  it("refuses a result that is not a Digest with 400 and leaves the task open for another answer", async () => {
    const task = await sentVerifyTask(instance);

    const refused = await answered(instance, task, {
      result: { ...VERIFY_ANSWER, tags: ["a", "b", "c", "d"] },
    });

    assert.equal(refused.status, 400);
    assert.match(errorOf(refused.text), /tags/u);
    assert.equal((await answered(instance, task, { result: VERIFY_ANSWER })).status, 204);
  });

  it("returns the timeout when no answer comes before the deadline, and a late answer is 409", async (t) => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(t, instance, task);

    pastDeadline(instance, task.id);

    assert.deepEqual(await result, { kind: "refused", reason: "timeout", status: null });
    assert.deepEqual(
      [taskRow(instance, task.id).state, taskRow(instance, task.id).refusal],
      ["failed", "timeout"],
    );
    assert.equal((await answered(instance, task, { result: VERIFY_ANSWER })).status, 409);
  });

  it("closes a Verify task to answers after its own window, not after the hour a library task gets", async () => {
    const task = await sentVerifyTask(instance);
    const left = taskRow(instance, task.id).deadline - Date.now();

    assert.ok(left > 60_000 && left < 120_000, `the window left was ${String(left)} ms`);

    pastDeadline(instance, task.id);

    assert.equal((await answered(instance, task, { result: VERIFY_ANSWER })).status, 409);
    assert.equal(taskRow(instance, task.id).answered_at, null);
  });

  it("returns provider-busy when the bot answers with an error", async (t) => {
    const task = await sentVerifyTask(instance);
    const { result } = await verifyingTask(t, instance, task);

    assert.equal((await answered(instance, task, { error: "The routine failed" })).status, 204);
    assert.deepEqual(await result, { kind: "refused", reason: "provider-busy", status: null });
  });

  it("stops waiting and closes the task when the caller goes away", async (t) => {
    const task = await sentVerifyTask(instance);
    const { result, caller } = await verifyingTask(t, instance, task);

    caller.abort();

    assert.equal((await result).kind, "refused");
    assert.equal(taskRow(instance, task.id).state, "failed");
  });

  it("through the route reports the failed send and records a failed Grok Bot Digest task with no job", async () => {
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
      [started?.kind, started?.executor, started?.job_id, started?.state],
      ["digest", "grok-bot", null, "failed"],
    );
  });

  it("through the route refuses with provider-busy and starts no task when the bot has no free place", async () => {
    occupyBot(instance, GROK_BOT_IN_FLIGHT);

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

describe("a waiting Verify reads only its own task row", () => {
  let source: Instance;
  let target: Instance;

  before(async () => {
    source = await Instance.start();
    await source.setUp();
    await savedLibrary(source, { inlineText: 1, fileText: 0 });
    target = await botInstance();
  });

  after(async () => {
    await source.close();
    await target.close();
  });

  it("answers unreachable when its next read finds the zip's task in place of the Verify task", async (t) => {
    const zip = await exportedZip(source);
    const task = await sentVerifyTask(target);

    await startedRestore(target, zip);
    await restoredDone(target);
    const { result } = await verifyingTask(t, target, task);

    const restoredSameId = target.database.count(
      "select count(*) as n from ai_tasks where id = ? and callback_hash is null and state = 'done'",
      task.id,
    );

    assert.deepEqual(
      [restoredSameId, VerifyResultSchema.parse(await result)],
      [1, { kind: "refused", reason: "unreachable", status: null }],
    );
  });
});
