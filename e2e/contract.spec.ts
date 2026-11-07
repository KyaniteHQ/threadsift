import { type APIRequestContext, type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { test } from "./access.ts";

interface ApiSchema {
  $ref?: string | undefined;
  required?: string[] | undefined;
  properties?: Record<string, ApiSchema> | undefined;
  items?: ApiSchema | undefined;
  oneOf?: ApiSchema[] | undefined;
  anyOf?: ApiSchema[] | undefined;
}

const SchemaNode: z.ZodType<ApiSchema> = z.lazy(() =>
  z.looseObject({
    $ref: z.string().optional(),
    required: z.array(z.string()).optional(),
    properties: z.record(z.string(), SchemaNode).optional(),
    items: SchemaNode.optional(),
    oneOf: z.array(SchemaNode).optional(),
    anyOf: z.array(SchemaNode).optional(),
  }),
);

const Body = z.looseObject({
  content: z.record(z.string(), z.looseObject({ schema: SchemaNode })),
});

const Operation = z.looseObject({ responses: z.record(z.string(), Body) });

const Parameters = z.array(z.looseObject({ name: z.string(), in: z.string() }));

const OpenApiDocument = z.looseObject({
  openapi: z.string(),
  components: z.looseObject({ schemas: z.record(z.string(), SchemaNode) }),
  paths: z.looseObject({
    "/api/items": z.looseObject({
      get: Operation.extend({ parameters: Parameters }),
      post: Operation.extend({ requestBody: Body }),
    }),
    "/api/items/{id}": z.looseObject({ get: Operation }),
    "/api/items/{id}/status": z.looseObject({ get: Operation }),
  }),
});

type Schemas = z.infer<typeof OpenApiDocument>["components"]["schemas"];

function resolved(schemas: Schemas, node: ApiSchema): ApiSchema {
  const name = node.$ref?.replace("#/components/schemas/", "");
  const target = name === undefined ? undefined : schemas[name];

  return target === undefined ? node : resolved(schemas, target);
}

function propertyNames(schemas: Schemas, node: ApiSchema): string[] {
  const { properties, oneOf = [], anyOf = [] } = resolved(schemas, node);

  return [
    ...new Set([
      ...Object.keys(properties ?? {}),
      ...[...oneOf, ...anyOf].flatMap((branch) => propertyNames(schemas, branch)),
    ]),
  ];
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

const ITEM_FIELDS = [
  "id",
  "source",
  "kind",
  "normalizedUrl",
  "originalUrl",
  "savedAt",
  "title",
  "digestTitle",
  "digestTopic",
  "digestOutcome",
  "readState",
  "author",
  "community",
  "fetchedAt",
  "fetch",
  "status",
  "reason",
  "retry",
];

async function documentOf(request: APIRequestContext, info: TestInfo) {
  const response = await request.get("/api/openapi.json");
  expect(response.headers()["content-type"]).toContain("application/json");
  await info.attach("openapi.json", {
    body: await response.body(),
    contentType: "application/json",
  });

  return OpenApiDocument.parse(await response.json());
}

type ListOperation = z.infer<typeof OpenApiDocument>["paths"]["/api/items"]["get"];

function expectListContract(schemas: Schemas, list: ListOperation): void {
  expect(list.parameters.map(({ name, in: place }) => `${place}:${name}`).toSorted()).toEqual([
    "query:q",
    "query:read",
    "query:source",
    "query:tag",
    "query:topic",
  ]);

  const answer = jsonSchemaOf(list.responses["200"] ?? { content: {} });
  expect(propertyNames(schemas, answer).toSorted()).toEqual(["counts", "items"]);

  expect(propertyNames(schemas, propertyOf(schemas, answer, "counts")).toSorted()).toEqual([
    "reads",
    "sources",
    "tags",
    "topics",
    "total",
    "unread",
  ]);
}

test("the served OpenAPI document describes the items routes", async ({ request }, info) => {
  const { paths, components } = await documentOf(request, info);
  const { schemas } = components;
  const items = paths["/api/items"];

  expect(Object.keys(items.post.requestBody.content)).toEqual(["application/json"]);
  expect(Object.keys(items.post.responses).toSorted()).toEqual(["200", "201", "400", "413"]);
  expect(Object.keys(items.get.responses).toSorted()).toEqual(["200", "400"]);

  expectListContract(schemas, items.get);

  const requestBody = resolved(schemas, jsonSchemaOf(items.post.requestBody));
  expect(propertyNames(schemas, requestBody).toSorted()).toEqual(["content", "digest", "url"]);
  expect(requestBody.required).toEqual(["url"]);

  const saved = jsonSchemaOf(items.post.responses["201"] ?? { content: {} });
  expect(propertyNames(schemas, saved).toSorted()).toEqual(["item", "url"]);

  const one = paths["/api/items/{id}"];

  expect(Object.keys(one.get.responses).toSorted()).toEqual(["200", "404"]);

  const single = propertyOf(
    schemas,
    jsonSchemaOf(one.get.responses["200"] ?? { content: {} }),
    "item",
  );

  const listed = propertyOf(
    schemas,
    jsonSchemaOf(items.get.responses["200"] ?? { content: {} }),
    "items",
  );

  const savedAgain = jsonSchemaOf(items.post.responses["200"] ?? { content: {} });

  for (const item of [
    propertyOf(schemas, saved, "item"),
    propertyOf(schemas, savedAgain, "item"),
    listed.items ?? {},
    single,
  ]) {
    expect(propertyNames(schemas, item)).toEqual(expect.arrayContaining(ITEM_FIELDS));
  }

  expect(propertyNames(schemas, single)).toEqual(
    expect.arrayContaining(["comments", "postText", "postedAt"]),
  );
});

test("the served OpenAPI document describes the status route without the post text", async ({
  request,
}, info) => {
  const { paths, components } = await documentOf(request, info);

  const polled = paths["/api/items/{id}/status"];

  expect(Object.keys(polled.get.responses).toSorted()).toEqual(["200", "404"]);

  const names = propertyNames(
    components.schemas,
    propertyOf(
      components.schemas,
      jsonSchemaOf(polled.get.responses["200"] ?? { content: {} }),
      "item",
    ),
  );

  expect(names).toEqual(expect.arrayContaining(ITEM_FIELDS));
  expect(names).not.toContain("comments");
  expect(names).not.toContain("postText");
  expect(names).not.toContain("postedAt");
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

test("/api answers JSON on its own and under any path, never the page", async ({
  request,
  stranger,
}) => {
  for (const [caller, status] of [
    [request, 404],
    [stranger, 401],
  ] as const) {
    for (const path of ["/api", "/api/", "/api/nothing-here"]) {
      const response = await caller.get(path);
      expect(response.status(), path).toBe(status);
      expect(response.headers()["content-type"], path).toContain("application/json");
    }
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
