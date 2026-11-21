import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { z } from "zod";

import { SCOPES } from "../src/core/contract/agent-token-contract.ts";
import { whoOf } from "../src/http/access.ts";
import { Instance } from "./instance.ts";
import { makeToken } from "./token-budget-fixtures.ts";

const OUTSIDE_DOCUMENT = new Set(["GET /api/openapi.json", "ALL /api/*"]);

const OperationSchema = z.object({
  description: z.string().optional(),
  responses: z.record(z.string(), z.unknown()),
});

const DocumentSchema = z.object({
  paths: z.record(z.string(), z.record(z.string(), OperationSchema)),
});

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replaceAll(/\/:([^/]+)/gu, "/{$1}")}`;
}

describe("the served OpenAPI document", () => {
  let instance: Instance;
  let operations: { method: string; path: string; operation: z.infer<typeof OperationSchema> }[];

  before(async () => {
    instance = await Instance.start();
    await instance.setUp();
    const { paths } = await instance.read("GET", "/api/openapi.json", DocumentSchema);

    operations = Object.entries(paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([verb, operation]) => ({
        method: verb.toUpperCase(),
        path,
        operation,
      })),
    );
  });

  after(() => instance.close());

  it("lists exactly the mounted REST methods and paths", () => {
    const served = new Set(
      instance.routes
        .filter(({ path }) => path === "/api" || path.startsWith("/api/"))
        .map(({ method, path }) => routeKey(method, path))
        .filter((key) => !OUTSIDE_DOCUMENT.has(key)),
    );
    const documented = operations.map(({ method, path }) => `${method} ${path}`);

    assert.ok(served.size > 0, "the Instance mounts REST routes");
    assert.deepEqual([...served].toSorted(), documented.toSorted());
  });

  it("documents the refusals and required access of each protected operation", async () => {
    const tokens = new Map(
      await Promise.all(
        ["owner", ...SCOPES].map(async (excluded) => {
          const scopes = SCOPES.filter((scope) => scope !== excluded);
          const { value } = await makeToken(instance, null, excluded, scopes);

          return [excluded, value] as const;
        }),
      ),
    );

    const gates = new Map(
      instance.routes.flatMap(({ method, path, handler }) => {
        const who = whoOf(handler);

        return who === undefined ? [] : [[routeKey(method, path), who] as const];
      }),
    );

    await Promise.all(
      operations.map(async ({ method, path, operation }) => {
        const url = path.replaceAll(/\{[^}]+\}/gu, "1");
        const key = `${method} ${path}`;
        const signedOut = await instance.fetch(url, {
          method,
          headers: { origin: "http://localhost", "content-type": "application/json" },
        });

        const gate = gates.get(key);

        if (gate === "anyone" && signedOut.status !== 401) return;

        assert.equal(signedOut.status, 401, key);

        for (const status of ["401", "403"]) {
          assert.ok(Object.hasOwn(operation.responses, status), `${key} must document ${status}`);
        }

        if (gate === "callback") return;

        const mentions = Array.from(
          (operation.description ?? "").matchAll(
            /Only the owner's session\b|An agent token needs the `([^`]+)` scope\b/gu,
          ),
          (match) => match[1] ?? "owner",
        );

        assert.deepEqual(mentions, [gate], `${key} must name its access rule once`);
        const token = tokens.get(mentions[0] ?? "");

        assert.ok(token !== undefined, `${key} must name the owner or a known scope`);
        const refused = await instance.sendWithToken(token, method, url);

        assert.equal(refused.status, 403, key);
      }),
    );
  });
});
