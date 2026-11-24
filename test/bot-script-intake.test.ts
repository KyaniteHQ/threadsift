import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";

import { ScriptWorld } from "./bot-script-world.ts";
import { taskRow } from "./bot-task-rows.ts";

const NINE_MIB = 9 * 1024 * 1024;

describe("the script answers an X link task and prints one word for each answer of a real Instance", () => {
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
    assert.match(world.folder.fileOf(task.id, "errors.txt") ?? "", /\S/u);
    assert.equal(taskRow(world.instance, task.id).state, "running");
    assert.equal(world.folder.fileOf(task.id, "done"), null);
  });

  it("answers too-large for a body over the route's limit", async () => {
    const task = await world.intake();

    assert.equal(await world.opened(task, "x_intake"), `ok ${String(task.id)} x_intake`);

    const file = world.folder.tmpFile("answer", JSON.stringify({ content: "a".repeat(NINE_MIB) }));

    assert.equal(await run(["task-answer", String(task.id), file]), "too-large");
  });
});
