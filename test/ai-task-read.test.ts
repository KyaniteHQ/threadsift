import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { z } from "zod";

import { X_INTAKE_INSTRUCTIONS } from "../src/core/contract/x-intake-contract.ts";
import { type ReadWorld, readOf, readTask, readWorld } from "./ai-task-read-http.ts";
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
    const { response: first, text, read } = await readTask(world.instance, task);

    assert.deepEqual([first.status, first.headers.get("cache-control")], [200, "no-store"]);
    assert.deepEqual([read.taskId, read.kind], [task.id, "related_pick"]);
    assert.notEqual(read.instructions, "");
    assert.equal(read.schema["type"], "object");
    assert.deepEqual(
      Object.keys(z.record(z.string(), z.unknown()).parse(read.schema["properties"])),
      ["picks"],
    );
    assert.equal(await (await readOf(world.instance, task.id, task.token)).text(), text);
    assert.deepEqual(taskRows(world.instance), unchanged);
  });

  it("answers a HEAD as its GET without the body, to the task's credential and to none", async () => {
    const task = await taskAfterStart(world.instance, world.library.source);
    const url = `/api/ai-tasks/${String(task.id)}`;
    const read = await readOf(world.instance, task.id, task.token);

    const head = await world.instance.fetch(url, {
      method: "HEAD",
      headers: { authorization: `Bearer ${task.token}` },
    });

    assert.deepEqual(
      [head.status, head.headers.get("cache-control"), head.headers.get("content-type")],
      [read.status, "no-store", read.headers.get("content-type")],
    );
    assert.equal(await head.text(), "");

    const anonymous = await world.instance.fetch(url, { method: "HEAD" });

    assert.deepEqual([anonymous.status, anonymous.headers.get("cache-control")], [401, "no-store"]);
  });

  it("reads an X link task with the link as its input and the answer it takes as its schema", async () => {
    const task = await sentIntake(world.instance);

    const { read } = await readTask(world.instance, task);

    assert.deepEqual(
      [read.kind, JSON.parse(read.input)],
      ["x_intake", { url: `https://x.com/i/status/${task.statusId}`, statusId: task.statusId }],
    );
    assert.equal(read.instructions, X_INTAKE_INSTRUCTIONS);
    assert.ok(Array.isArray(read.schema["anyOf"]));
  });

  it("answers 401 with one body and a Bearer challenge for a missing, wrong, foreign or unknown credential and 403 for a session or an agent token", async () => {
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

        return [
          response.status,
          await response.text(),
          response.headers.get("cache-control"),
          response.headers.get("www-authenticate"),
        ];
      }),
    );

    assert.deepEqual([...new Set(refused.map(([status]) => status))], [401]);
    assert.deepEqual([...new Set(refused.map(([, , cache]) => cache))], ["no-store"]);
    assert.deepEqual(
      refused.map(([, , , challenge]) => challenge),
      ["Bearer", ...Array.from({ length: 4 }, () => 'Bearer error="invalid_token"')],
    );
    assert.equal(new Set(refused.map(([, body]) => body)).size, 1);

    const forbidden = await Promise.all([
      readOf(world.instance, task.id, world.agentToken),
      readOf(world.instance, task.id, null, world.instance.ownerCookie),
    ]);

    assert.deepEqual(
      forbidden.map(({ status }) => status),
      [403, 403],
    );
    assert.deepEqual(
      forbidden.map(({ headers }) => headers.get("www-authenticate")),
      [null, null],
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
