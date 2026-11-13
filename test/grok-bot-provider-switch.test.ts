import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { claimNextDue, executeClaimed } from "../src/core/jobs.ts";
import {
  type BotLibrary,
  answerOf,
  botInstance,
  openJob,
  picksFor,
  relatedLibrary,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { startedTask } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, rowCount, taskRow, taskRows } from "./bot-task-rows.ts";
import { chooseGrokBot, sentVerifyTask, waitingIntake } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { exec, saveProvider } from "./related-fixtures.ts";

const HOUR_MS = 3_600_000;

describe("a Related pick on Grok Bot follows the lifecycle through the production runner, and a change of Provider abandons what is open", () => {
  let instance: Instance;
  let library: BotLibrary;

  const firstCandidate = () => {
    const [candidate] = library.candidates;

    assert.ok(candidate !== undefined);

    return candidate;
  };

  before(async () => {
    instance = await botInstance();
    library = await relatedLibrary(instance);
    assert.equal((await chooseGrokBot(instance)).status, 200);
  });

  after(() => instance.close());

  it("applies an answered third send at attempts 2 without counting an attempt", async () => {
    const job = await openJob(instance, library.source, 2);
    const task = await startedTask(instance, job);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    assert.equal(
      (await answered(instance, task, answerOf(picksFor(firstCandidate())))).status,
      204,
    );

    await executeClaimed(instance.core, job);

    const done = jobRow(instance, job.id);

    assert.deepEqual([done.state, done.attempts], ["done", 2]);
    assert.equal(rowCount(instance, "related_items"), 1);
  });

  it("fails every open Provider task as abandoned and makes its job due at once, leaves the X link task alone, and runs the other Provider at the next claim", async () => {
    exec(instance, "delete from related_items");

    const job = await openJob(instance, library.source, 0);
    const task = await startedTask(instance, job);
    const verifying = await sentVerifyTask(instance);
    const intake = await waitingIntake(instance);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    await executeClaimed(instance.core, job);
    assert.ok(jobRow(instance, job.id).next_attempt_at > Date.now() + HOUR_MS / 2);

    await saveProvider(instance);

    for (const abandoned of [task.id, verifying.id]) {
      const row = taskRow(instance, abandoned);

      assert.deepEqual([row.state, row.refusal], ["failed", "abandoned"]);
    }

    assert.equal(taskRow(instance, intake.id).state, "running");
    assert.ok(jobRow(instance, intake.job.id).next_attempt_at > Date.now() + HOUR_MS / 2);
    assert.ok(jobRow(instance, job.id).next_attempt_at <= Date.now());

    exec(instance, "update jobs set state = 'done', claim_expires = null where kind = 'digest'");

    const known = taskRows(instance).length;
    const claimed = await claimNextDue(instance.core.db);

    assert.equal(claimed?.id, job.id);

    await executeClaimed(instance.core, claimed ?? job);

    const [next] = taskRows(instance).slice(known);

    assert.equal(next?.executor, "http");

    const late = await answered(instance, task, answerOf(picksFor(firstCandidate())));

    assert.equal(late.status, 409);
    assert.equal(taskRow(instance, task.id).answered_at, null);
    assert.equal(rowCount(instance, "related_items"), 0);
  });

  it("frees the places the abandoned tasks held", async () => {
    await chooseGrokBot(instance);

    for (const slot of [1, 2, 3, 4, 5, 6, 7]) {
      exec(
        instance,
        "update ai_tasks set sent_at = 1 where id = ?",
        insertedTask(instance, {
          kind: "digest",
          executor: "grok-bot",
          token: `held-${String(slot)}`,
        }),
      );
    }

    const busy = await instance.send("POST", "/api/settings/ai/verify");

    assert.match(busy.body, /provider-busy/u);

    await saveProvider(instance);
    await chooseGrokBot(instance);

    const free = await instance.send("POST", "/api/settings/ai/verify");

    assert.doesNotMatch(free.body, /provider-busy/u);
  });
});
