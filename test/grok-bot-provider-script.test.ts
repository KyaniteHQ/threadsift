import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { TaskReadSchema } from "../src/core/ai-task-read.ts";
import { ScriptWorld } from "./bot-script-world.ts";
import { taskRow } from "./bot-task-rows.ts";
import { sentVerifyTask } from "./grok-bot-provider-fixtures.ts";

const ANSWER = {
  title: "Quasar lattice",
  topic: "Quasars",
  tags: ["quasar"],
  summary: "A short summary.",
  keyPoints: ["One point"],
  keptComments: [],
};

describe("the Threadsift bot's script opens and answers a Verify task like any Digest task", () => {
  let world: ScriptWorld;

  before(async () => {
    world = await ScriptWorld.start();
  });

  after(() => world.close());

  it("opens the task from its thin event, reads its instructions and schema, and closes it with an answer the Digest schema takes", async () => {
    const task = await sentVerifyTask(world.instance);
    const id = String(task.id);

    assert.equal(await world.opened(task, "digest"), `ok ${id} digest`);

    const read = TaskReadSchema.parse(JSON.parse(world.folder.fileOf(task.id, "task.json") ?? ""));

    assert.deepEqual([read.taskId, read.kind], [task.id, "digest"]);
    assert.notEqual(read.instructions, "");
    assert.equal(read.schema["type"], "object");

    const answer = world.folder.taskFile(task.id, "answer.json", JSON.stringify(ANSWER));

    assert.equal((await world.folder.run(["task-answer", id, answer], world.env())).word, "ok");
    assert.notEqual(taskRow(world.instance, task.id).answered_at, null);
  });
});
