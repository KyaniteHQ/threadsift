import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { z } from "zod";

import { type ReadWorld, readWorld } from "./ai-task-read-http.ts";
import { answerOf, pastDeadline, picksFor, retireTasks } from "./bot-task-fixtures.ts";
import { answered, answerTo, errorOf, rawAnswerTo } from "./bot-task-http.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, taskRow } from "./bot-task-rows.ts";
import type { Json } from "./instance.ts";
import { exec } from "./sqlite-fixtures.ts";

describe("the result route answers each status of its contract and writes nothing on a refusal", () => {
  let instance: ReadWorld["instance"];
  let library: ReadWorld["library"];
  let agentToken = "";

  let candidate: number;
  const valid = () => answerOf(picksFor(candidate));
  const fresh = () => taskAfterStart(instance, library.source);

  before(async () => {
    ({ instance, library, agentToken } = await readWorld());
    const [first] = library.candidates;
    assert.ok(first !== undefined);
    candidate = first;
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  it("stores an accepted answer on the task, leaves it running and makes the owning job due", async () => {
    const task = await fresh();
    const started = Date.now();

    const answer = await answered(instance, task, valid());
    const row = taskRow(instance, task.id);

    assert.equal(answer.status, 204);
    assert.equal(row.state, "running");
    assert.deepEqual(JSON.parse(row.result ?? "null"), picksFor(candidate));
    assert.ok((row.answered_at ?? 0) >= started);
    assert.ok(jobRow(instance, task.job.id).next_attempt_at >= started);
  });

  it("answers 401 with one body and a Bearer challenge for a missing, malformed, foreign, unknown and non-bearer credential and for a task id that is not canonical", async () => {
    const task = await fresh();
    const other = await fresh();
    const body = valid();

    const answers = await Promise.all([
      ...[
        { id: task.id, token: null },
        { id: task.id, token: "not-a-task-credential" },
        { id: task.id, token: `${task.token}x` },
        { id: task.id, token: other.token },
        { id: 999_999, token: task.token },
        { id: "abc", token: task.token },
        { id: `0${String(task.id)}`, token: task.token },
        { id: `0x${task.id.toString(16)}`, token: task.token },
        { id: `${String(task.id)}.0`, token: task.token },
      ].map((who) => answered(instance, who, body)),
      ...[`Basic ${task.token}`, ""].map((authorization) =>
        answered(instance, { id: task.id, token: null }, body, { authorization }),
      ),
    ]);

    assert.deepEqual([...new Set(answers.map(({ status }) => status))], [401]);
    assert.deepEqual(
      answers.map(({ challenge }) => challenge),
      [
        "Bearer",
        ...Array.from({ length: 8 }, () => 'Bearer error="invalid_token"'),
        "Bearer",
        "Bearer",
      ],
    );
    assert.equal(new Set(answers.map(({ text }) => text)).size, 1);
    assert.equal(taskRow(instance, task.id).answered_at, null);
  });

  it("answers 400 to a result nested too deeply to read and leaves the task open", async () => {
    const task = await fresh();
    const depth = 100_000;

    const response = await rawAnswerTo(
      instance,
      task,
      `{"result":${"[".repeat(depth)}${"]".repeat(depth)}}`,
    );

    const row = taskRow(instance, task.id);

    assert.equal(response.status, 400);
    assert.deepEqual([row.state, row.answered_at, row.result], ["running", null, null]);
  });

  it("stores the answer as the task's schema read it, without the keys the schema does not name", async () => {
    const task = await fresh();
    const padding = "x".repeat(10_000);

    const answer = await answered(instance, task, {
      result: { picks: [{ item: candidate, reason: "Both cover the same lattice." }], padding },
    });

    assert.equal(answer.status, 204);
    assert.deepEqual(JSON.parse(taskRow(instance, task.id).result ?? "null"), picksFor(candidate));
  });

  it("answers 403 to the owner's session and to an agent token, and stores nothing", async () => {
    const task = await fresh();
    const body = valid();

    const path = `/api/ai-tasks/${String(task.id)}/result`;
    const session = await instance.send("POST", path, body);
    const agent = await instance.sendWithToken(agentToken, "POST", path, body);

    const mismatch = await instance.send("POST", path, body, {
      authorization: "Bearer tst_not-this-tasks-credential",
    });

    assert.deepEqual([session.status, agent.status, mismatch.status], [403, 403, 403]);
    assert.equal(taskRow(instance, task.id).answered_at, null);
  });

  it("answers 400 unsupported-task for x_intake, caller and unregistered kinds and changes nothing", async () => {
    const cases = [
      ["x_intake", "grok-bot"],
      ["related_pick", "caller"],
      ["highlight_proposals", "grok-bot"],
      ["related_pick", "http"],
      ["toString", "grok-bot"],
    ] as const;

    const made = cases.map(([kind, executor], index) => {
      const token = `tst_unsupported-${String(index)}`;

      return { token, id: insertedTask(instance, { kind, executor, token }) };
    });

    const ids = made.map(({ id }) => id);

    const stored = ids.map((id) => taskRow(instance, id));

    const answers = await Promise.all(made.map((who) => answered(instance, who, valid())));

    assert.deepEqual(
      answers.map(({ status, text }) => [status, errorOf(text)]),
      cases.map(() => [400, "unsupported-task"]),
    );
    assert.deepEqual(
      ids.map((id) => taskRow(instance, id)),
      stored,
    );
  });

  it("answers 409 to a second answer, to one past the deadline before any sweep, and to a failed task", async () => {
    const answeredTask = await fresh();
    const late = await fresh();
    const failed = await fresh();

    assert.equal((await answered(instance, answeredTask, valid())).status, 204);
    pastDeadline(instance, late.id);
    exec(
      instance,
      "update ai_tasks set state = 'failed', refusal = 'timeout' where id = ?",
      failed.id,
    );

    const rowsBefore = [answeredTask, late, failed].map(({ id }) => taskRow(instance, id));

    const statuses = await Promise.all(
      [answeredTask, late, failed].map(
        async (task) => (await answered(instance, task, valid())).status,
      ),
    );

    assert.deepEqual(statuses, [409, 409, 409]);
    assert.deepEqual(
      [answeredTask, late, failed].map(({ id }) => taskRow(instance, id)),
      rowsBefore,
    );
  });

  it("refuses malformed result and error bodies and leaves the task open for a valid result", async () => {
    const task = await fresh();
    const bodies: readonly Json[] = [
      {},
      [],
      null,
      "text",
      { result: { picks: [] }, error: "x" },
      { error: "" },
      { error: "x".repeat(201) },
      { error: 5 },
      { answer: 1 },
      { result: { picks: [] }, extra: 1 },
      { result: null },
      { result: "text" },
    ];
    const statuses = await Promise.all(
      bodies.map(async (body) => (await answered(instance, task, body)).status),
    );
    assert.deepEqual(
      statuses,
      bodies.map(() => 400),
    );
    const row = taskRow(instance, task.id);
    assert.deepEqual([row.state, row.answered_at, row.result], ["running", null, null]);
    assert.equal((await answered(instance, task, { result: { picks: [] } })).status, 204);
  });

  it("accepts an error of length 1 or 200", async () => {
    assert.equal((await answered(instance, await fresh(), { error: "x" })).status, 204);
    assert.equal((await answered(instance, await fresh(), { error: "x".repeat(200) })).status, 204);
  });

  it("accepts exactly one of two simultaneous answers and keeps the winner's result", async () => {
    const task = await fresh();
    const [first, second] = library.candidates;

    assert.ok(first !== undefined && second !== undefined);

    const answers = await Promise.all(
      [first, second].map(async (item) => ({
        item,
        status: (await answered(instance, task, answerOf(picksFor(item)))).status,
      })),
    );

    const winner = answers.find(({ status }) => status === 204);
    const row = taskRow(instance, task.id);

    assert.deepEqual(
      answers.map(({ status }) => status).toSorted((left, right) => left - right),
      [204, 409],
    );
    assert.deepEqual(JSON.parse(row.result ?? "null"), picksFor(winner?.item ?? 0));
  });

  it("fails the task provider-busy and makes the job due for an { error } answer", async (t) => {
    const task = await fresh();

    const logged = t.mock.method(console, "warn");
    const answer = await answered(instance, task, {
      error: "Could not read https://x.com/author/status/123?s=private-query",
    });
    const calls = logged.mock.calls;
    const events = calls
      .filter(({ arguments: [line] }) => String(line).includes("grok-bot-error"))
      .map(({ arguments: args }) => {
        const [line] = z.tuple([z.string()]).parse(args);
        return z.record(z.string(), z.unknown()).parse(JSON.parse(line));
      });

    assert.equal(answer.status, 204);
    assert.deepEqual(events, [{ event: "grok-bot-error", taskId: task.id, jobId: task.job.id }]);
    assert.ok(
      calls.every(({ arguments: args }) => !JSON.stringify(args).includes("private-query")),
    );

    const row = taskRow(instance, task.id);

    assert.deepEqual([row.state, row.refusal, row.result], ["failed", "provider-busy", null]);
    assert.equal((await answered(instance, task, valid())).status, 409);
  });

  it("answers 400 with the reasons for a result the kind refuses, keeps the task open and takes a valid answer after", async () => {
    const task = await fresh();
    const unsent = 999_999;

    const notSent = await answered(instance, task, answerOf(picksFor(unsent)));

    assert.equal(notSent.status, 400);
    assert.match(errorOf(notSent.text), /candidate that was sent/u);
    assert.equal(taskRow(instance, task.id).answered_at, null);
    assert.equal(taskRow(instance, task.id).result, null);
    assert.equal((await answered(instance, task, valid())).status, 204);
  });

  it("passes a JSON post from any origin and caps the body at 256 KiB", async () => {
    const task = await fresh();
    const big = answerOf({ picks: [], padding: "x".repeat(257 * 1024) });

    const tooBig = await answerTo(instance, task, big);

    const foreign = await answerTo(instance, task, valid(), {
      origin: "https://bot.example",
    });

    assert.equal(tooBig.status, 413);
    assert.equal(foreign.status, 204);
  });
});
