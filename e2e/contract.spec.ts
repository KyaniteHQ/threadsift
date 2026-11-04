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

test("a path with a file extension that matches no file is a 404 and a page path is the page", async ({
  request,
}) => {
  for (const path of ["/favicon.ico", "/assets/missing.js", "/robots.txt"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }

  for (const path of ["/", "/items/1", "/anything/else"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
  }
});

test("hashed assets are cached for good and the page is always revalidated", async ({
  request,
}) => {
  const page = await request.get("/");
  const asset = /\/assets\/[^"]+\.js/u.exec(await page.text())?.[0] ?? "";
  expect(asset).not.toBe("");

  expect(page.headers()["cache-control"]).toBe("no-cache");
  expect((await request.get("/items/1")).headers()["cache-control"]).toBe("no-cache");
  expect((await request.get(asset)).headers()["cache-control"]).toBe(
    "public, max-age=31536000, immutable",
  );
});
