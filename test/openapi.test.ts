import assert from "node:assert/strict";
import { it } from "node:test";

import { z } from "zod";

import { Instance } from "./instance.ts";

const OUTSIDE_DOCUMENT = new Set(["GET /api/openapi.json", "ALL /api/*"]);

it("describes every mounted REST method and path in the served OpenAPI document", async (t) => {
  const instance = await Instance.start();

  t.after(() => instance.close());
  await instance.setUp();

  const { paths } = await instance.read(
    "GET",
    "/api/openapi.json",
    z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) }),
  );

  const missing = new Set<string>();

  for (const { method, path } of instance.app.routes) {
    if (path !== "/api" && !path.startsWith("/api/")) continue;
    if (OUTSIDE_DOCUMENT.has(`${method} ${path}`)) continue;

    const template = path.replaceAll(/\/:([^/]+)/gu, "/{$1}");

    if (!Object.hasOwn(paths[template] ?? {}, method.toLowerCase())) {
      missing.add(`${method} ${template}`);
    }
  }

  assert.deepEqual([...missing].toSorted(), []);
});
