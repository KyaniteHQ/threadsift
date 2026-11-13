import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { CreatedTokenResponseSchema } from "../src/http/schemas.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  pastDeadline,
  picksFor,
  relatedLibrary,
  retireTasks,
  saveBot,
} from "./bot-task-fixtures.ts";
import { answered, answerTo, errorOf, rawAnswerTo } from "./bot-task-http.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { insertedTask, jobRow, taskRow } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";
import { exec } from "./related-fixtures.ts";

const PATH_OF = (id: number | string) => `/api/ai-tasks/${String(id)}/result`;

describe("the result route answers each status of its contract and writes nothing on a refusal", () => {
  let instance: Instance;
  let library: BotLibrary;
  let agentToken = "";

  const candidate = () => {
    const [first] = library.candidates;

    assert.ok(first !== undefined);

    return first;
  };

  const fresh = () => taskAfterStart(instance, library.source);

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
    ({ value: agentToken } = await instance.read(
      "POST",
      "/api/tokens",
      CreatedTokenResponseSchema,
      { name: "bot-task-route" },
    ));
  });

  beforeEach(() => {
    retireTasks(instance);
  });

  after(() => instance.close());

  it("stores an accepted answer on the task, leaves it running and makes the owning job due", async () => {
    const task = await fresh();
    const started = Date.now();

    const answer = await answered(instance, task, answerOf(picksFor(candidate())));
    const row = taskRow(instance, task.id);

    assert.equal(answer.status, 204);
    assert.equal(row.state, "running");
    assert.deepEqual(JSON.parse(row.result ?? "null"), picksFor(candidate()));
    assert.ok((row.answered_at ?? 0) >= started);
    assert.ok(jobRow(instance, task.job.id).next_attempt_at >= started);
  });

  it("answers 401 with one body for a missing, malformed, foreign, unknown and non-bearer credential", async () => {
    const task = await fresh();
    const other = await fresh();
    const body = answerOf(picksFor(candidate()));

    const basic = await instance.fetch(PATH_OF(task.id), {
      method: "POST",
      headers: { authorization: `Basic ${task.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const answers = [
      ...(await Promise.all(
        [
          { id: task.id, token: null },
          { id: task.id, token: "not-a-task-credential" },
          { id: task.id, token: `${task.token}x` },
          { id: task.id, token: other.token },
          { id: 999_999, token: task.token },
          { id: "abc", token: task.token },
        ].map((who) => answered(instance, who, body)),
      )),
      { status: basic.status, text: await basic.text() },
    ];

    assert.deepEqual(
      answers.map(({ status }) => status),
      [401, 401, 401, 401, 401, 401, 401],
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
      result: { picks: [{ item: candidate(), reason: "Both cover the same lattice." }], padding },
    });

    assert.equal(answer.status, 204);
    assert.deepEqual(
      JSON.parse(taskRow(instance, task.id).result ?? "null"),
      picksFor(candidate()),
    );
  });

  it("answers 403 to the owner's session and to an agent token, and stores nothing", async () => {
    const task = await fresh();
    const body = answerOf(picksFor(candidate()));

    const session = await instance.send("POST", PATH_OF(task.id), body);
    const agent = await instance.sendWithToken(agentToken, "POST", PATH_OF(task.id), body);

    const mismatch = await instance.send("POST", PATH_OF(task.id), body, {
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

    const answers = await Promise.all(
      made.map((who) => answered(instance, who, answerOf(picksFor(candidate())))),
    );

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

    assert.equal(
      (await answered(instance, answeredTask, answerOf(picksFor(candidate())))).status,
      204,
    );
    pastDeadline(instance, late.id);
    exec(
      instance,
      "update ai_tasks set state = 'failed', refusal = 'timeout' where id = ?",
      failed.id,
    );

    const rowsBefore = [answeredTask, late, failed].map(({ id }) => taskRow(instance, id));

    const statuses = await Promise.all(
      [answeredTask, late, failed].map(
        async (task) => (await answered(instance, task, answerOf(picksFor(candidate())))).status,
      ),
    );

    assert.deepEqual(statuses, [409, 409, 409]);
    assert.deepEqual(
      [answeredTask, late, failed].map(({ id }) => taskRow(instance, id)),
      rowsBefore,
    );
  });

  it("answers 400 to a body that is neither { result } nor { error }", async () => {
    const task = await fresh();

    assert.equal((await answered(instance, task, { answer: "no" })).status, 400);
    assert.equal(taskRow(instance, task.id).answered_at, null);
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

  it("fails the task provider-busy and makes the job due for an { error } answer", async () => {
    const task = await fresh();

    assert.equal((await answered(instance, task, { error: "I could not do it." })).status, 204);

    const row = taskRow(instance, task.id);

    assert.deepEqual([row.state, row.refusal, row.result], ["failed", "provider-busy", null]);
    assert.equal((await answered(instance, task, answerOf(picksFor(candidate())))).status, 409);
  });

  it("answers 400 with the reasons for a result the kind refuses, keeps the task open and takes a valid answer after", async () => {
    const task = await fresh();
    const unsent = 999_999;

    const notSent = await answered(instance, task, answerOf(picksFor(unsent)));

    assert.equal(notSent.status, 400);
    assert.match(errorOf(notSent.text), /candidate that was sent/u);
    assert.equal(taskRow(instance, task.id).answered_at, null);
    assert.equal(taskRow(instance, task.id).result, null);
    assert.equal((await answered(instance, task, answerOf(picksFor(candidate())))).status, 204);
  });

  it("passes a JSON post from any origin and caps the body at 256 KiB", async () => {
    const task = await fresh();
    const big = answerOf({ picks: [], padding: "x".repeat(257 * 1024) });

    const tooBig = await answerTo(instance, task, big);

    const foreign = await answerTo(instance, task, answerOf(picksFor(candidate())), {
      origin: "https://bot.example",
    });

    assert.equal(tooBig.status, 413);
    assert.equal(foreign.status, 204);
  });
});
