import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it, mock } from "node:test";

import { z } from "zod";

import { isPublic } from "../src/http/access-rules.ts";
import {
  type BotLibrary,
  SECRET_KEY,
  answerOf,
  picksFor,
  relatedLibrary,
  saveBot,
} from "./bot-task-fixtures.ts";
import { answered } from "./bot-task-http.ts";
import { step, taskAfterStart } from "./bot-task-lifecycle.ts";
import { digestOfToken, taskRow } from "./bot-task-rows.ts";
import { Instance } from "./instance.ts";

const PATH_OF = (id: number | string) => `/api/ai-tasks/${String(id)}/result`;

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

  it("stores a digest, holds the value in no database file, and replaces the digest at a resend so the first credential answers 401", async () => {
    const logged = mock.method(console, "warn");
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
      answerOf(picksFor(library.candidates[0] ?? 0)),
    );

    const main = await readFile(instance.databaseFile);
    const lines = logged.mock.calls.map(({ arguments: args }) => String(args[0]));

    logged.mock.restore();

    assert.notEqual(renewed.callback_hash, issued.callback_hash);
    assert.deepEqual([renewed.state, renewed.refusal], ["failed", "unreachable"]);
    assert.equal(stale.status, 401);
    assert.ok(!main.includes(token));
    assert.ok(lines.some((line) => line.includes("grok-bot-send")));
    assert.ok(lines.every((line) => !line.includes(token) && !line.includes("no-such-host")));
  });
});

describe("the callback route is credential-only and every other route stays closed", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("lets the guard pass the result route and nothing next to it", () => {
    assert.equal(isPublic("POST", PATH_OF(1)), true);
    assert.equal(isPublic("GET", PATH_OF(1)), false);
    assert.equal(isPublic("POST", `${PATH_OF(1)}/more`), false);
    assert.equal(isPublic("POST", "/api/ai-tasks/1"), false);
    assert.equal(isPublic("POST", "/api/ai-tasks//result"), false);
  });

  it("answers 401 to every documented route that is not public, and documents the result route once", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    const calls = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods)
        .map((method) => [method.toUpperCase(), path] as const)
        .filter(([method, route]) => !isPublic(method, route)),
    );

    const statuses = await Promise.all(
      calls.map(async ([method, path]) => [
        method,
        path,
        (
          await instance.fetch(path.replaceAll(/\{[^}]+\}/gu, "1"), {
            method,
            headers: { "content-type": "application/json" },
          })
        ).status,
      ]),
    );

    assert.deepEqual(
      statuses.filter(([, , status]) => status !== 401),
      [],
    );
    assert.deepEqual(Object.keys(document.paths["/api/ai-tasks/{id}/result"] ?? {}), ["post"]);
  });
});
