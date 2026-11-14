import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { z } from "zod";

import { botInstance } from "./bot-task-fixtures.ts";
import type { Instance } from "./instance.ts";
import { answerOf, contentOf, digestOf } from "./x-intake-bodies.ts";
import { intakeTo, waitingIntake } from "./x-intake-fixtures.ts";
import { refusalsOf } from "./x-intake-rows.ts";

const SECRET_KEY_NAME = "tst_secret_key_name";

const SECRET_VALUE = "an answer text that must not be logged";

const OTHER_POST = "987654321987654321";

const SECRET_NESTED = "tst_secret_nested_key";

const LoggedSchema = z.looseObject({
  event: z.string(),
  taskId: z.number(),
  itemId: z.number(),
  refusals: z.number(),
  issues: z.string(),
});

function warned(calls: readonly Readonly<{ arguments: readonly unknown[] }>[]): readonly string[] {
  return calls.map(({ arguments: args }) => String(args[0]));
}

function refusalsIn(lines: readonly string[]) {
  return lines.flatMap((line) =>
    line.includes("grok-bot-answer-refused") ? [LoggedSchema.parse(JSON.parse(line))] : [],
  );
}

describe("a refused X link answer is logged with codes the Instance owns and counted whatever refused it", () => {
  let instance: Instance;

  beforeEach(async () => {
    instance = await botInstance();
  });

  afterEach(() => instance.close());

  it("logs each refusal with the task, the Item, the count and issue codes, and no text the bot chose", async () => {
    const logged = mock.method(console, "warn");
    const task = await waitingIntake(instance);
    const keyed = await waitingIntake(instance);
    const nested = await waitingIntake(instance);

    await intakeTo(instance, task, { content: SECRET_VALUE });
    await intakeTo(instance, task, { content: SECRET_VALUE });
    await intakeTo(instance, keyed, { content: SECRET_VALUE, [SECRET_KEY_NAME]: 1 });

    await intakeTo(instance, nested, {
      content: JSON.stringify({
        post: {
          id: nested.statusId,
          author: "a",
          text: "t",
          postedAt: null,
          replies: null,
          [SECRET_NESTED]: SECRET_VALUE,
        },
        replies: [],
      }),
    });

    const other = await waitingIntake(instance);

    await intakeTo(instance, other, { content: contentOf(OTHER_POST) });

    const lines = warned(logged.mock.calls);

    logged.mock.restore();

    const refusals = refusalsIn(lines);

    assert.deepEqual(
      refusals
        .slice(0, 2)
        .map(({ event, taskId, itemId, refusals: count, issues }) => [
          event,
          taskId,
          itemId,
          count,
          issues,
        ]),
      [
        ["grok-bot-answer-refused", task.id, task.itemId, 1, "not-json"],
        ["grok-bot-answer-refused", task.id, task.itemId, 2, "not-json"],
      ],
    );
    assert.match(refusals[2]?.issues ?? "", /unrecognized_keys@/u);
    assert.match(refusals[3]?.issues ?? "", /unrecognized_keys@post/u);

    assert.match(refusals[4]?.issues ?? "", /^thread-rule the post id # is not the status id/u);

    const secrets = [SECRET_KEY_NAME, SECRET_VALUE, SECRET_NESTED, OTHER_POST, task.token];

    assert.ok(lines.every((line) => secrets.every((secret) => !line.includes(secret))));
  });

  it("keeps the full reasons in the 400 for the bot, which sent that text itself", async () => {
    const task = await waitingIntake(instance);

    const response = await intakeTo(instance, task, {
      content: contentOf(task.statusId),
      digest: { title: "" },
    });

    assert.equal(response.status, 400);
    assert.match(await response.text(), /digest\.title: Too small/u);
  });

  it("cuts the logged codes of a Digest with many bad kept comment ids below the length of the full list", async () => {
    const logged = mock.method(console, "warn");
    const task = await waitingIntake(instance);

    const response = await intakeTo(instance, task, {
      content: contentOf(task.statusId),
      digest: { ...digestOf(), keptComments: Array.from({ length: 100 }, () => "x".repeat(40)) },
    });

    const lines = warned(logged.mock.calls);

    logged.mock.restore();

    const [refusal] = refusalsIn(lines);

    assert.ok((await response.text()).length > 1000);
    assert.ok((refusal?.issues.length ?? 0) <= 1000);
    assert.ok((refusal?.issues.length ?? 0) > 900);
  });

  it("counts a body of the wrong type, a refused Digest and a thread of another post alike", async () => {
    const task = await waitingIntake(instance);

    assert.equal((await intakeTo(instance, task, { content: 5 })).status, 400);
    assert.equal(refusalsOf(instance, task.id), 1);
    assert.equal(
      (await intakeTo(instance, task, { content: "{}", digest: { title: "" } })).status,
      400,
    );
    assert.equal(refusalsOf(instance, task.id), 2);

    const other = await waitingIntake(instance);

    assert.equal((await intakeTo(instance, other, answerOf("1"))).status, 400);
    assert.equal(refusalsOf(instance, other.id), 1);
  });
});
