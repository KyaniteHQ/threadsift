import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { Instance, SECRET_KEY } from "./instance.ts";

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
