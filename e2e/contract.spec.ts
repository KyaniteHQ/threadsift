import { expect, test } from "@playwright/test";
import { z } from "zod";

const Operation = z.looseObject({ responses: z.record(z.string(), z.unknown()) });

const OpenApiDocument = z.looseObject({
  openapi: z.string(),
  paths: z.looseObject({
    "/api/items": z.looseObject({
      get: Operation,
      post: Operation.extend({
        requestBody: z.looseObject({ content: z.record(z.string(), z.unknown()) }),
      }),
    }),
  }),
});

test("the served OpenAPI document describes the items routes", async ({ request }) => {
  const response = await request.get("/api/openapi.json");
  expect(response.headers()["content-type"]).toContain("application/json");
  const { paths } = OpenApiDocument.parse(await response.json());
  const items = paths["/api/items"];

  expect(Object.keys(items.post.requestBody.content)).toEqual(["application/json"]);
  expect(Object.keys(items.post.responses).toSorted()).toEqual(["200", "201", "400"]);
  expect(Object.keys(items.get.responses)).toEqual(["200"]);
  expect(JSON.stringify(items.post.requestBody)).toContain('"url"');
  expect(JSON.stringify(items.post.responses["201"])).toContain('"item"');
  expect(JSON.stringify(items.get.responses["200"])).toContain('"items"');
});
