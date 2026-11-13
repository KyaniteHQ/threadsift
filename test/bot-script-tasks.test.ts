import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

import { TaskReadSchema } from "../src/core/ai-task-read.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { pastDeadline, picksFor } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { taskRow } from "./bot-task-rows.ts";

const NINE_MIB = 9 * 1024 * 1024;
const HOUR = 3600;
const DAY = 24 * HOUR;

const ageBy = (file: string, seconds: number) => {
  const then = Date.now() / 1000 - seconds;

  utimesSync(file, then, then);
};

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

    assert.equal(await world.opened({ id: task.id, token: foreign.token }, "x"), "unauthorized");
    assert.equal(await world.opened({ id: task.id, token: world.agentToken }, "x"), "forbidden");
    assert.equal(await world.opened({ id: 999_999, token: task.token }, "x"), "unauthorized");
    assert.deepEqual(
      world.folder.tree().filter((entry) => entry.startsWith("tasks/")),
      [],
    );
    assert.equal(await world.opened(task, "related_pick"), `ok ${String(task.id)} related_pick`);

    const read = TaskReadSchema.parse(JSON.parse(world.folder.fileOf(task.id, "task.json") ?? ""));

    assert.deepEqual([read.taskId, read.kind], [task.id, "related_pick"]);
    assert.equal(world.folder.fileOf(task.id, "token"), task.token);
    assert.deepEqual(
      world.folder.tree().filter((entry) => entry.startsWith("tmp/event-")),
      [],
    );
  });

  it("answers a result task, writes the server's reasons for an answer that does not fit, then marks the task done by its credential and answers already-done to the same event", async () => {
    const task = await world.result();
    const id = String(task.id);
    const answers = JSON.stringify(picksFor(world.candidate));

    assert.equal(await world.opened(task, "related_pick"), `ok ${id} related_pick`);
    assert.equal(
      await run(["task-intake", id, await world.folder.made("answer", answers)]),
      "bad-input",
    );
    assert.equal(
      await run(["task-answer", id, await world.folder.made("answer", '{"picks":"none"}')]),
      "invalid",
    );
    assert.notEqual(world.folder.fileOf(task.id, "errors.txt"), "");
    assert.equal(taskRow(world.instance, task.id).answered_at, null);
    assert.equal(world.folder.fileOf(task.id, "done"), null);
    const fits = await world.folder.made("answer", answers);

    assert.equal(await run(["task-answer", id, fits]), "ok");
    assert.equal(existsSync(fits), false);
    assert.equal(world.folder.fileOf(task.id, "done"), sha256(task.token));
    assert.equal(world.folder.fileOf(task.id, "token"), null);
    assert.notEqual(taskRow(world.instance, task.id).answered_at, null);
    assert.equal(await world.opened(task, "related_pick"), "already-done");
    assert.equal(
      await run(["task-answer", id, await world.folder.made("answer", answers)]),
      "bad-input",
    );
  });

  it("answers already-open and changes nothing for a second event of a task that is open, and keeps the first token for an event whose token the Instance refuses", async () => {
    const task = await world.result();
    const foreign = await world.intake();
    const id = String(task.id);

    assert.equal(await world.opened(task, "related_pick"), `ok ${id} related_pick`);

    const opened = world.folder.fileOf(task.id, "task.json");

    assert.equal(await world.opened(task, "related_pick"), "already-open");
    assert.equal(await world.opened({ id: task.id, token: foreign.token }, "x"), "already-open");
    assert.equal(world.folder.fileOf(task.id, "task.json"), opened);
    assert.equal(world.folder.fileOf(task.id, "token"), task.token);

    ageBy(join(world.folder.taskFolder(task.id), "task.json"), 2 * HOUR);
    assert.equal(await world.opened({ id: task.id, token: foreign.token }, "x"), "unauthorized");
    assert.equal(world.folder.fileOf(task.id, "task.json"), opened);
    assert.equal(world.folder.fileOf(task.id, "token"), task.token);
    assert.equal(await world.opened(task, "related_pick"), `ok ${id} related_pick`);
  });

  it("deletes the folder of a task that was done more than 7 days ago and the token of a task left open for more than a day when it opens a task", async () => {
    const task = await world.intake();
    const finished = world.folder.taskFolder(111);
    const abandoned = world.folder.taskFolder(222);
    const recent = world.folder.taskFolder(333);

    for (const folder of [finished, abandoned, recent]) {
      mkdirSync(folder, { recursive: true });
    }

    writeFileSync(join(finished, "done"), "x");
    writeFileSync(join(abandoned, "token"), "x");
    writeFileSync(join(abandoned, "task.json"), "{}");
    writeFileSync(join(recent, "done"), "x");
    ageBy(join(finished, "done"), 8 * DAY);
    ageBy(join(abandoned, "token"), 2 * DAY);
    ageBy(join(recent, "done"), 6 * DAY);

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);
    assert.equal(existsSync(finished), false);
    assert.equal(existsSync(join(abandoned, "token")), false);
    assert.equal(existsSync(join(abandoned, "task.json")), true);
    assert.equal(existsSync(join(recent, "done")), true);
  });

  it("answers closed and marks the task done when Threadsift no longer takes an answer", async () => {
    const answeredElsewhere = await world.result();
    const late = await world.intake();
    const file = await world.folder.made("answer", '{"unavailable":true}');

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
        await world.folder.made("answer", JSON.stringify(picksFor(1))),
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

    const file = await world.folder.made("answer", task.example);

    assert.equal(await run(["task-answer", String(task.id), file]), "ok");
    assert.equal(taskRow(world.instance, task.id).state, "done");
  });

  it("answers an X link task with an answer written in parts that are split inside an escape sequence and inside a multi-byte character", async () => {
    const task = await world.intake();

    const retitled = task.example.replace(
      '"title":"Backing up SQLite while it is written"',
      '"title":"Yedekleme ğüşiöç"',
    );

    assert.notEqual(retitled, task.example);

    const bytes = Buffer.from(retitled);

    const escape = bytes.indexOf(Buffer.from('\\"')) + 1;
    const multibyte = bytes.indexOf(Buffer.from("ğ")) + 1;
    const [first = 0, second = 0] = [escape, multibyte].toSorted((left, right) => left - right);

    assert.ok(first > 0 && second > first);

    const file = await world.folder.madeInParts("answer", [
      bytes.subarray(0, first),
      bytes.subarray(first, second),
      bytes.subarray(second),
    ]);

    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);
    assert.equal(await run(["task-answer", String(task.id), file]), "ok");
    assert.equal(taskRow(world.instance, task.id).state, "done");
  });

  it("closes an X link task with the unavailable answer", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = await world.folder.made("answer", '{"unavailable":true}');

    assert.equal(await run(["task-answer", String(task.id), file]), "ok");
    assert.equal(taskRow(world.instance, task.id).state, "done");
  });

  it("writes the server's reasons to errors.txt for content that is not the task's post and leaves the task open", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = await world.folder.made("answer", '{"content":"not a thread"}');

    assert.equal(await run(["task-answer", String(task.id), file]), "invalid");
    assert.notEqual(world.folder.fileOf(task.id, "errors.txt"), "");
    assert.equal(taskRow(world.instance, task.id).state, "running");
    assert.equal(world.folder.fileOf(task.id, "done"), null);
  });

  it("answers too-large for a body over the route's limit", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.tmpFile("answer", JSON.stringify({ content: "a".repeat(NINE_MIB) }));

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
    const good = () => world.folder.made("answer", '{"unavailable":true}');
    const id = String(task.id);

    assert.equal(await run(["task-answer", id, await good()]), "bad-input");
    assert.equal(await world.opened(task, "x_intake"), `ok ${id} x_intake`);
    assert.equal(
      await run(["task-answer", id, await world.folder.made("answer", "not json")]),
      "bad-input",
    );
    assert.equal(
      await run(["task-answer", id, await good()], world.env("http://127.0.0.1:1")),
      "unreachable",
    );
    assert.equal(
      await run(["task-answer", id, await good()], world.env(world.failingAddress)),
      "failed",
    );
    assert.equal(taskRow(world.instance, task.id).state, "running");
  });
});
