import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { claimNextDue, executeClaimed } from "../src/core/compose/jobs.ts";
import {
  type BotLibrary,
  answerOf,
  botInstance,
  openJob,
  picksFor,
  relatedLibrary,
  GROK_BOT_IN_FLIGHT,
  selectGrokBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { startedTask } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, rowCount, taskRow, taskRows } from "./bot-task-rows.ts";
import { sentVerifyTask } from "./grok-bot-provider-fixtures.ts";
import type { Instance } from "./instance.ts";
import { pairsOf, saveProvider } from "./related-fixtures.ts";
import { exec } from "./sqlite-fixtures.ts";
import { waitingIntake } from "./x-intake-fixtures.ts";

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
    await selectGrokBot(instance);
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
    assert.deepEqual(
      pairsOf(instance, library.source).map(({ related_id }) => related_id),
      [firstCandidate()],
    );
  });

  it("fails every open Provider task as abandoned and makes its job due at once, leaves the X link task alone, and runs the other Provider at the next claim", async () => {
    exec(instance, "delete from related_items");

    const job = await openJob(instance, library.source, 0);
    const task = await startedTask(instance, job);
    const verifying = await sentVerifyTask(instance);
    const intake = await waitingIntake(instance);

    exec(instance, "update ai_tasks set sent_at = ? where id = ?", Date.now(), task.id);
    await executeClaimed(instance.core, job);
    assert.equal(jobRow(instance, job.id).next_attempt_at, taskRow(instance, task.id).deadline);

    assert.ok(jobRow(instance, job.id).next_attempt_at > Date.now() + 30 * 60_000);
    const intakeDue = jobRow(instance, intake.job.id).next_attempt_at;
    assert.ok(intakeDue > Date.now() + 30 * 60_000);

    await saveProvider(instance);

    for (const abandoned of [task.id, verifying.id]) {
      const row = taskRow(instance, abandoned);

      assert.deepEqual([row.state, row.refusal], ["failed", "abandoned"]);
    }

    assert.equal(taskRow(instance, intake.id).state, "running");
    assert.equal(jobRow(instance, intake.job.id).next_attempt_at, intakeDue);
    assert.equal(
      jobRow(instance, intake.job.id).next_attempt_at,
      taskRow(instance, intake.id).deadline,
    );
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
    await selectGrokBot(instance);

    for (const slot of Array.from({ length: GROK_BOT_IN_FLIGHT }, (_, at) => at)) {
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
    await selectGrokBot(instance);

    const free = await instance.send("POST", "/api/settings/ai/verify");

    assert.equal(free.status, 200);
    assert.deepEqual(JSON.parse(free.body), {
      kind: "refused",
      reason: "unreachable",
      status: null,
    });
  });
});
