import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { TaskReadSchema } from "../src/core/ai-task-read.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { pastDeadline, picksFor } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { taskRow } from "./bot-task-rows.ts";

const NINE_MIB = 9 * 1024 * 1024;

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

describe("the script opens, answers and reports a task and prints one word for each answer of a real Instance", () => {
  let world: ScriptWorld;

  const run = async (args: readonly string[], env = world.env()) =>
    (await world.folder.run(args, env)).word;

  before(async () => {
    world = await ScriptWorld.start();
  });

  beforeEach(() => {
    world.reset();
  });

  after(() => world.close());

  it("opens a task from its event into task.json and answers unauthorized or forbidden for a credential that is not the task's", async () => {
    const task = await world.result();
    const foreign = await world.intake();

    assert.equal(await world.opened(task, "related_pick"), `ok ${String(task.id)} related_pick`);

    const read = TaskReadSchema.parse(JSON.parse(world.folder.fileOf(task.id, "task.json") ?? ""));

    assert.deepEqual([read.taskId, read.kind], [task.id, "related_pick"]);
    assert.equal(world.folder.fileOf(task.id, "token"), task.token);
    assert.equal(existsSync(join(world.folder.path, "tmp", "event-1.json")), false);
    assert.equal(await world.opened({ id: task.id, token: foreign.token }, "x"), "unauthorized");
    assert.equal(await world.opened({ id: task.id, token: world.agentToken }, "x"), "forbidden");
    assert.equal(await world.opened({ id: 999_999, token: task.token }, "x"), "unauthorized");
  });

  it("answers a result task, writes the server's reasons for an answer that does not fit, then marks the task done by its credential and answers already-done to the same event", async () => {
    const task = await world.result();
    const id = String(task.id);
    const misfit = world.folder.taskFile(task.id, "misfit.json", '{"picks":"none"}');

    const fits = world.folder.taskFile(
      task.id,
      "fits.json",
      JSON.stringify(picksFor(world.candidate)),
    );

    assert.equal(await world.opened(task, "related_pick"), `ok ${id} related_pick`);
    assert.equal(await run(["task-intake", id, fits]), "bad-input");
    assert.equal(await run(["task-answer", id, misfit]), "invalid");
    assert.notEqual(world.folder.fileOf(task.id, "errors.txt"), "");
    assert.equal(taskRow(world.instance, task.id).answered_at, null);
    assert.equal(world.folder.fileOf(task.id, "done"), null);
    assert.equal(await run(["task-answer", id, fits]), "ok");
    assert.equal(world.folder.fileOf(task.id, "done"), sha256(task.token));
    assert.equal(world.folder.fileOf(task.id, "token"), null);
    assert.notEqual(taskRow(world.instance, task.id).answered_at, null);
    assert.equal(await world.opened(task, "related_pick"), "already-done");
    assert.equal(await run(["task-answer", id, fits]), "bad-input");
  });

  it("answers closed and marks the task done when Threadsift no longer takes an answer", async () => {
    const answeredElsewhere = await world.result();
    const late = await world.intake();
    const file = world.folder.taskFile(late.id, "gone.json", '{"unavailable":true}');

    pastDeadline(world.instance, late.id);
    assert.equal(await world.opened(late, "x_intake"), "closed");
    assert.equal(world.folder.fileOf(late.id, "done"), sha256(late.token));
    assert.equal(await run(["task-answer", String(late.id), file]), "bad-input");

    assert.equal(
      await world.opened(answeredElsewhere, "related_pick"),
      `ok ${String(answeredElsewhere.id)} related_pick`,
    );
    assert.equal(
      (
        await answered(world.instance, answeredElsewhere, {
          result: picksFor(world.candidate),
        })
      ).status,
      204,
    );
    assert.equal(
      await run([
        "task-answer",
        String(answeredElsewhere.id),
        world.folder.taskFile(answeredElsewhere.id, "again.json", JSON.stringify(picksFor(1))),
      ]),
      "closed",
    );
    assert.equal(
      world.folder.fileOf(answeredElsewhere.id, "done"),
      sha256(answeredElsewhere.token),
    );
  });

  it("answers an X link task through the answer route of its kind with the skill's example thread and Digest", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.taskFile(task.id, "answer.json", task.example);

    assert.equal(await run(["task-answer", String(task.id), file]), "ok");
    assert.equal(taskRow(world.instance, task.id).state, "done");
  });

  it("closes an X link task with the unavailable answer", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.taskFile(task.id, "answer.json", '{"unavailable":true}');

    assert.equal(await run(["task-answer", String(task.id), file]), "ok");
    assert.equal(taskRow(world.instance, task.id).state, "done");
  });

  it("writes the server's reasons to errors.txt for content that is not the task's post and leaves the task open", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.taskFile(task.id, "answer.json", '{"content":"not a thread"}');

    assert.equal(await run(["task-answer", String(task.id), file]), "invalid");
    assert.notEqual(world.folder.fileOf(task.id, "errors.txt"), "");
    assert.equal(taskRow(world.instance, task.id).state, "running");
    assert.equal(world.folder.fileOf(task.id, "done"), null);
  });

  it("answers too-large for a body over the route's limit", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.taskFile(
      task.id,
      "answer.json",
      JSON.stringify({ content: "a".repeat(NINE_MIB) }),
    );

    assert.equal(await run(["task-answer", String(task.id), file]), "too-large");
  });

  it("reports a fixed sentence for a reason word on a result task, refuses an unknown word and refuses any report for an X link task", async () => {
    const result = await world.result();
    const intake = await world.intake();

    assert.equal(
      await world.opened(result, "related_pick"),
      `ok ${String(result.id)} related_pick`,
    );
    assert.equal(
      await run(["task-error", String(result.id), "cannot read the input"]),
      "bad-input",
    );
    assert.equal(await run(["task-error", String(result.id), "no-answer"]), "ok");
    assert.deepEqual(
      [taskRow(world.instance, result.id).state, taskRow(world.instance, result.id).refusal],
      ["failed", "provider-busy"],
    );
    assert.equal(await world.opened(intake, "x_intake"), `ok ${String(intake.id)} x_intake`);
    assert.equal(await run(["task-error", String(intake.id), "no-answer"]), "bad-input");
    assert.equal(taskRow(world.instance, intake.id).state, "running");
  });

  it("answers bad-input for an answer before task-open and for an answer that is not JSON, and unreachable or failed for an Instance that does not answer", async () => {
    const task = await world.intake();
    const text = world.folder.taskFile(task.id, "text.json", "not json");
    const good = world.folder.taskFile(task.id, "good.json", '{"unavailable":true}');

    assert.equal(await run(["task-answer", String(task.id), good]), "bad-input");
    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);
    assert.equal(await run(["task-answer", String(task.id), text]), "bad-input");
    assert.equal(
      await run(["task-answer", String(task.id), good], world.env("http://127.0.0.1:1")),
      "unreachable",
    );
    assert.equal(
      await run(["task-answer", String(task.id), good], world.env(world.failingAddress)),
      "failed",
    );
    assert.equal(taskRow(world.instance, task.id).state, "running");
  });
});
