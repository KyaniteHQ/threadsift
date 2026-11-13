import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { TaskReadSchema } from "../src/core/ai-task-read.ts";
import { X_INTAKE_INSTRUCTIONS } from "../src/core/x-intake-contract.ts";
import { type ReadWorld, readOf, readWorld } from "./ai-task-read-http.ts";
import { pastDeadline, picksFor, retireTasks } from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { taskAfterStart } from "./bot-task-lifecycle.ts";
import { taskRows } from "./bot-task-rows.ts";
import { sentIntake } from "./x-intake-fixtures.ts";

describe("the task read answers what the bot has to do to the task's own credential and changes nothing", () => {
  let world: ReadWorld;

  before(async () => {
    world = await readWorld();
  });

  beforeEach(() => {
    retireTasks(world.instance);
  });

  after(() => world.instance.close());

  it("reads a result task with its kind, instructions, input and schema, and a second read is the same", async () => {
    const task = await taskAfterStart(world.instance, world.library.source);
    const unchanged = taskRows(world.instance);
    const first = await readOf(world.instance, task.id, task.token);
    const text = await first.text();
    const read = TaskReadSchema.parse(JSON.parse(text));

    assert.deepEqual([first.status, first.headers.get("cache-control")], [200, "no-store"]);
    assert.deepEqual([read.taskId, read.kind], [task.id, "related_pick"]);
    assert.notEqual(read.instructions, "");
    assert.equal(read.schema["type"], "object");
    assert.equal(await (await readOf(world.instance, task.id, task.token)).text(), text);
    assert.deepEqual(taskRows(world.instance), unchanged);
  });

  it("reads an X link task with the link as its input and the answer it takes as its schema", async () => {
    const task = await sentIntake(world.instance);

    const read = TaskReadSchema.parse(
      JSON.parse(await (await readOf(world.instance, task.id, task.token)).text()),
    );

    assert.deepEqual(
      [read.kind, read.instructions, JSON.parse(read.input)],
      [
        "x_intake",
        X_INTAKE_INSTRUCTIONS,
        { url: `https://x.com/i/status/${task.statusId}`, statusId: task.statusId },
      ],
    );
    assert.ok(Array.isArray(read.schema["anyOf"]));
  });

  it("answers 401 with one body for a missing, wrong, foreign or unknown credential and 403 for a session or an agent token", async () => {
    const task = await taskAfterStart(world.instance, world.library.source);
    const other = await sentIntake(world.instance);

    const attempts: readonly (readonly [number | string, string | null])[] = [
      [task.id, null],
      [task.id, "tst_wrong"],
      [task.id, other.token],
      [999_999, task.token],
      ["abc", task.token],
    ];

    const refused = await Promise.all(
      attempts.map(async ([id, token]) => {
        const response = await readOf(world.instance, id, token);

        return [response.status, await response.text(), response.headers.get("cache-control")];
      }),
    );

    assert.deepEqual([...new Set(refused.map(([status]) => status))], [401]);
    assert.deepEqual([...new Set(refused.map(([, , cache]) => cache))], ["no-store"]);
    assert.equal(new Set(refused.map(([, body]) => body)).size, 1);
    assert.equal((await readOf(world.instance, task.id, world.agentToken)).status, 403);
    assert.equal(
      (await readOf(world.instance, task.id, null, world.instance.sessionCookie ?? "")).status,
      403,
    );
  });

  it("answers 409 once the task is answered or past its deadline, and sends no instructions", async () => {
    const answeredTask = await taskAfterStart(world.instance, world.library.source);
    const late = await sentIntake(world.instance);

    pastDeadline(world.instance, late.id);

    assert.equal(
      (
        await answered(world.instance, answeredTask, {
          result: picksFor(world.library.candidates[0] ?? 0),
        })
      ).status,
      204,
    );

    const refusals = await Promise.all(
      [answeredTask, late].map(async ({ id, token }) => {
        const response = await readOf(world.instance, id, token);

        return [
          response.status,
          (await response.text()).includes("instructions"),
          response.headers.get("cache-control"),
        ];
      }),
    );

    assert.deepEqual(refusals, [
      [409, false, "no-store"],
      [409, false, "no-store"],
    ]);
  });
});
