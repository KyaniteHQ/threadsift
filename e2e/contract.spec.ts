import { expect, test } from "@playwright/test";
import { z } from "zod";

interface ApiSchema {
  $ref?: string | undefined;
  properties?: Record<string, ApiSchema> | undefined;
  items?: ApiSchema | undefined;
}

const SchemaNode: z.ZodType<ApiSchema> = z.lazy(() =>
  z.looseObject({
    $ref: z.string().optional(),
    properties: z.record(z.string(), SchemaNode).optional(),
    items: SchemaNode.optional(),
  }),
);

const Body = z.looseObject({
  content: z.record(z.string(), z.looseObject({ schema: SchemaNode })),
});

const Operation = z.looseObject({ responses: z.record(z.string(), Body) });

const OpenApiDocument = z.looseObject({
  openapi: z.string(),
  components: z.looseObject({ schemas: z.record(z.string(), SchemaNode) }),
  paths: z.looseObject({
    "/api/items": z.looseObject({
      get: Operation,
      post: Operation.extend({ requestBody: Body }),
    }),
  }),
});

type Schemas = z.infer<typeof OpenApiDocument>["components"]["schemas"];

function resolved(schemas: Schemas, node: ApiSchema): ApiSchema {
  const name = node.$ref?.replace("#/components/schemas/", "");
  const target = name === undefined ? undefined : schemas[name];

  return target === undefined ? node : resolved(schemas, target);
}

function propertyNames(schemas: Schemas, node: ApiSchema): string[] {
  return Object.keys(resolved(schemas, node).properties ?? {});
}

function propertyOf(schemas: Schemas, node: ApiSchema, name: string): ApiSchema {
  const property = resolved(schemas, node).properties?.[name];
  expect(property, `the schema describes ${name}`).toBeDefined();

  return property ?? {};
}

function jsonSchemaOf(body: z.infer<typeof Body>): ApiSchema {
  const schema = body.content["application/json"]?.["schema"];
  expect(schema, "an application/json body").toBeDefined();

  return schema ?? {};
}

test("the served OpenAPI document describes the items routes", async ({ request }) => {
  const response = await request.get("/api/openapi.json");
  expect(response.headers()["content-type"]).toContain("application/json");
  const { paths, components } = OpenApiDocument.parse(await response.json());
  const { schemas } = components;
  const items = paths["/api/items"];

  expect(Object.keys(items.post.requestBody.content)).toEqual(["application/json"]);
  expect(Object.keys(items.post.responses).toSorted()).toEqual(["200", "201", "400"]);
  expect(Object.keys(items.get.responses)).toEqual(["200"]);
  expect(propertyNames(schemas, jsonSchemaOf(items.post.requestBody))).toEqual(["url"]);

  const saved = jsonSchemaOf(items.post.responses["201"] ?? { content: {} });
  expect(propertyNames(schemas, saved)).toEqual(expect.arrayContaining(["item", "url", "fetch"]));

  const listed = propertyOf(
    schemas,
    jsonSchemaOf(items.get.responses["200"] ?? { content: {} }),
    "items",
  );

  for (const item of [propertyOf(schemas, saved, "item"), listed.items ?? {}]) {
    expect(propertyNames(schemas, item)).toEqual(
      expect.arrayContaining(["title", "author", "community", "fetchedAt"]),
    );
  }
});

test("a path with a file extension that matches no file is a 404 and a page path is the page", async ({
  request,
}) => {
  for (const path of ["/favicon.ico", "/assets/missing.js", "/robots.txt"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }

  for (const path of ["/", "/items/1", "/anything/else", "/_headers"]) {
    for (const method of ["get", "head"] as const) {
      const response = await request[method](path);
      expect(response.status(), `${method} ${path}`).toBe(200);
      expect(response.headers()["content-type"], `${method} ${path}`).toContain("text/html");
    }
  }

  const index = await request.get("/index.html", { maxRedirects: 0 });
  expect(index.status()).toBe(307);
  expect(index.headers()["location"]).toBe("/");
});

test("/api answers JSON on its own and under any path, never the page", async ({ request }) => {
  for (const path of ["/api", "/api/", "/api/nothing-here"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()["content-type"], path).toContain("application/json");
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
