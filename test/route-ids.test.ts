import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { ErrorResponseSchema } from "../src/core/contract/error-wire.ts";
import { Instance } from "./instance.ts";

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
        "content-type": call.json ? "application/json" : "application/octet-stream",
      },
    };

    if (call.method !== "GET" && call.method !== "DELETE") init.body = call.json ? "{}" : "x";

    const response = await instance.request(url, init);

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
