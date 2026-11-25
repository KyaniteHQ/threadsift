import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import {
  type BotLibrary,
  answerOf,
  picksFor,
  relatedLibrary,
  saveBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { digestOfToken, taskRow } from "./bot-task-rows.ts";
import { Instance, SECRET_KEY } from "./instance.ts";

describe("the task credential is kept only as a digest and ends at a resend", () => {
  let instance: Instance;
  let library: BotLibrary;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
    await saveBot(instance);
    library = await relatedLibrary(instance);
  });

  after(() => instance.close());

  it("stores a digest, holds the value in no database file, and replaces the digest at a resend so the first credential answers 401", async (t) => {
    const logged = t.mock.method(console, "warn");
    const { job, id, token } = await taskAfterStart(instance, library.source);
    const issued = taskRow(instance, id);

    assert.equal(issued.callback_hash, digestOfToken(token));
    assert.notEqual(issued.callback_hash, token);
    assert.ok(token.startsWith("tst_"));

    await assert.rejects(step(instance, job), /send failed: unreachable/u);

    const renewed = taskRow(instance, id);

    const stale = await answered(
      instance,
      { id, token },
      answerOf(picksFor(library.candidates[0])),
    );

    const main = await readFile(instance.databaseFile);
    const lines = logged.mock.calls.map(({ arguments: args }) => String(args[0]));

    assert.ok(renewed.callback_hash !== null && renewed.callback_hash.length > 0);
    assert.ok(main.includes(renewed.callback_hash));

    assert.notEqual(renewed.callback_hash, issued.callback_hash);
    assert.deepEqual([renewed.state, renewed.refusal], ["failed", "unreachable"]);
    assert.equal(stale.status, 401);
    assert.ok(!main.includes(token));
    assert.ok(lines.some((line) => line.includes("grok-bot-send")));
    assert.ok(lines.every((line) => !line.includes(token) && !line.includes("no-such-host")));
  });
});
