import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it, mock } from "node:test";

import { z } from "zod";

import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
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

const OPEN_CALLS: ReadonlySet<string> = new Set([
  "GET /api/session",
  "POST /api/setup/code",
  "POST /api/setup",
  "POST /api/login",
  "POST /api/password/reset",
  "GET /api/ai-tasks/{id}",
  "POST /api/ai-tasks/{id}/result",
  "POST /api/ai-tasks/{id}/intake",
]);

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

const CALLBACK_NEIGHBOURS: readonly (readonly [string, string])[] = [
  ["GET", "/api/ai-tasks/1/result"],
  ["POST", "/api/ai-tasks/1/result/more"],
  ["POST", "/api/ai-tasks/1"],
  ["POST", "/api/ai-tasks//result"],
  ["HEAD", "/api/ai-tasks/1"],
  ["HEAD", "/api/ai-tasks/1/result"],
];

describe("the callback route is credential-only and every other route stays closed", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start({ secretKey: SECRET_KEY });
    await instance.setUp();
  });

  after(() => instance.close());

  it("answers 401 with a Bearer challenge to every documented route that is not public and to the paths beside the task routes, and documents the result route once", async () => {
    const document = z
      .object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) })
      .parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));

    const calls = [
      ...Object.entries(document.paths).flatMap(([path, methods]) =>
        Object.keys(methods)
          .map((method) => [method.toUpperCase(), path] as const)
          .filter(([method, route]) => !OPEN_CALLS.has(`${method} ${route}`)),
      ),
      ...CALLBACK_NEIGHBOURS,
    ];

    const answers = await Promise.all(
      calls.map(async ([method, path]) => {
        const response = await instance.fetch(path.replaceAll(/\{[^}]+\}/gu, "1"), {
          method,
          headers: { "content-type": "application/json" },
        });

        return [method, path, response.status, response.headers.get("www-authenticate")];
      }),
    );

    assert.deepEqual(
      answers.filter(([, , status, challenge]) => status !== 401 || challenge !== "Bearer"),
      [],
    );
    assert.deepEqual(Object.keys(document.paths["/api/ai-tasks/{id}/result"] ?? {}), ["post"]);
  });
});

const BAD_IDS = ["0", "016", "0x10", "1e3", "+16", "16.0", "%2016%20", "9007199254740992"];

const PATH_SLOTS = new Set(["id", "highlightId", "part"]);

const OperationSchema = z.object({
  parameters: z
    .array(
      z.object({
        name: z.string(),
        in: z.string(),
        schema: z.object({ pattern: z.string().optional() }).optional(),
      }),
    )
    .default([]),
  requestBody: z.object({ content: z.record(z.string(), z.unknown()) }).optional(),
});

const DocumentSchema = z.object({
  paths: z.record(z.string(), z.record(z.string(), OperationSchema)),
});

interface IdCall {
  readonly method: string;
  readonly path: string;
  readonly slot: string;
  readonly json: boolean;
}

describe("every id in a path and every number in an Item or Highlight cursor reads one canonical rule", () => {
  let instance: Instance;

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
  });

  after(() => instance.close());

  async function document() {
    return DocumentSchema.parse(JSON.parse((await instance.send("GET", "/api/openapi.json")).body));
  }

  async function idCalls(): Promise<readonly IdCall[]> {
    const { paths } = await document();

    return Object.entries(paths)
      .filter(([path]) => !path.startsWith("/api/ai-tasks/") && !path.startsWith("/api/files/"))
      .flatMap(([path, methods]) =>
        Object.entries(methods).flatMap(([method, operation]) =>
          operation.parameters
            .filter(({ name, in: where }) => where === "path" && PATH_SLOTS.has(name))
            .map(({ name }) => ({
              method: method.toUpperCase(),
              path,
              slot: name,
              json: "application/json" in (operation.requestBody?.content ?? {}),
            })),
        ),
      );
  }

  async function answerTo(call: Readonly<IdCall>, id: string) {
    const url = call.path.replaceAll(/\{(?<name>[^}]+)\}/gu, (_, name: string) =>
      name === call.slot ? id : "1",
    );

    const init: RequestInit = {
      method: call.method,
      headers: {
        origin: "http://localhost",
        cookie: instance.sessionCookie ?? "",
        "content-type": call.json ? "application/json" : "application/octet-stream",
      },
    };

    if (call.method !== "GET" && call.method !== "DELETE") init.body = call.json ? "{}" : "x";

    const response = await instance.fetch(url, init);

    return { status: response.status, text: await response.text() };
  }

  it("answers 400 with one body for a zero, a leading zero, a base prefix, an exponent, a sign, a fraction, a space and a number past the safe range, on every route that has an id", async () => {
    const calls = await idCalls();

    assert.ok(calls.length >= 20);

    const tried = await Promise.all(
      calls.map(async (call) => ({
        call,
        answers: await Promise.all(BAD_IDS.map((id) => answerTo(call, id))),
        control: await answerTo(call, "1"),
      })),
    );

    for (const { call, answers, control } of tried) {
      const label = `${call.method} ${call.path} ${call.slot}`;
      const [first] = answers;

      assert.deepEqual(
        answers.map(({ status }) => [label, status]),
        BAD_IDS.map(() => [label, 400]),
      );
      assert.equal(new Set(answers.map(({ text }) => text)).size, 1, label);
      assert.ok(
        ErrorResponseSchema.parse(JSON.parse(first?.text ?? "null")).error.startsWith(
          `${call.slot}: `,
        ),
        label,
      );
      assert.notEqual(control.text, first?.text, label);
    }
  });

  it("serves a parameter pattern that accepts 16 and refuses 016", async () => {
    const { paths } = await document();

    const patterns = Object.entries(paths)
      .filter(([path]) => !path.startsWith("/api/files/"))
      .flatMap(([, methods]) => Object.values(methods))
      .flatMap(({ parameters }) => parameters)
      .filter(({ name, in: where }) => where === "path" && PATH_SLOTS.has(name))
      .map(({ schema }) => schema?.pattern);

    assert.ok(patterns.length >= 20);
    assert.deepEqual(
      patterns.map((pattern) =>
        pattern === undefined
          ? null
          : [new RegExp(pattern, "u").test("16"), new RegExp(pattern, "u").test("016")],
      ),
      patterns.map(() => [true, false]),
    );
  });

  it("answers 400 for an Item cursor and a Highlight cursor that hold a leading zero, a zero or a number past the safe range", async () => {
    const paths = [
      ...["0016.5", "5.0016", "0.5", "5.0", "9007199254740992.5", "5.9007199254740992"].map(
        (cursor) => `/api/items?cursor=${cursor}`,
      ),
      ...[
        "0016.note.5",
        "5.note.0016",
        "0.note.5",
        "5.note.0",
        "9007199254740992.note.5",
        "5.note.9007199254740992",
      ].map((cursor) => `/api/highlights?cursor=${cursor}`),
    ];

    const statuses = await Promise.all(
      paths.map(async (path) => (await instance.send("GET", path)).status),
    );

    assert.deepEqual(
      statuses,
      paths.map(() => 400),
    );
  });
});
