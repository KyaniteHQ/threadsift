import { type APIRequestContext, type TestInfo, expect } from "@playwright/test";
import { z } from "zod";

import { routeTemplate } from "../tools/pr-copy/routes.ts";
import { test } from "./access.ts";
import {
  Body,
  SchemaNode,
  type Schemas,
  expectPageSchema,
  jsonSchemaOf,
  propertyNames,
  propertyOf,
  resolved,
} from "./openapi-schema.ts";

const Operation = z.looseObject({ responses: z.record(z.string(), Body) });

const DescribedOperation = z.looseObject({
  responses: z.record(z.string(), Body.extend({ description: z.string() })),
});

const Removal = z.looseObject({
  responses: z.record(z.string(), z.looseObject({ description: z.string() })),
});

const Parameters = z.array(z.looseObject({ name: z.string(), in: z.string() }));

const OpenApiDocument = z.looseObject({
  openapi: z.string(),
  components: z.looseObject({ schemas: z.record(z.string(), SchemaNode) }),
  paths: z.looseObject({
    "/api/items": z.looseObject({
      get: Operation.extend({ parameters: Parameters }),
      post: DescribedOperation.extend({ requestBody: Body }),
    }),
    "/api/items/{id}": z.looseObject({ get: Operation, delete: Removal }),
    "/api/items/{id}/status": z.looseObject({ get: Operation }),
    "/api/items/{id}/highlights": z.looseObject({ post: Removal }),
    "/api/items/{id}/highlights/{highlightId}": z.looseObject({ delete: Removal }),
    "/api/items/{id}/note": z.looseObject({ put: Removal }),
  }),
});

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
  "commentsKept",
  "commentsTotal",
  "status",
  "reason",
  "retry",
  "fillable",
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
    "query:cursor",
    "query:q",
    "query:read",
    "query:source",
    "query:tag",
    "query:topic",
    "query:url",
  ]);

  const answer = jsonSchemaOf(list.responses["200"] ?? { content: {} });
  expect(propertyNames(schemas, answer).toSorted()).toEqual(["counts", "items", "next"]);

  expect(propertyNames(schemas, propertyOf(schemas, answer, "counts")).toSorted()).toEqual([
    "reads",
    "sources",
    "tags",
    "topics",
    "total",
    "unread",
  ]);
}

type SaveOperation = z.infer<typeof OpenApiDocument>["paths"]["/api/items"]["post"];

function expectSaveContract(schemas: Schemas, save: SaveOperation): void {
  const body = resolved(schemas, jsonSchemaOf(save.requestBody));

  expect(Object.keys(save.requestBody.content)).toEqual(["application/json"]);
  expect(Object.keys(save.responses).toSorted()).toEqual([
    "200",
    "201",
    "400",
    "409",
    "413",
    "503",
  ]);
  expect(propertyNames(schemas, body).toSorted()).toEqual([
    "content",
    "digest",
    "fill",
    "page",
    "url",
  ]);
  expect(body.required).toEqual(["url"]);
  expectPageSchema(schemas, body);
  expect(save.responses["413"]?.description).toContain(
    "`page` is longer than 1,000,000 bytes once serialized as JSON",
  );
}

test("the served OpenAPI document describes the items routes", async ({ request }, info) => {
  const { paths, components } = await documentOf(request, info);
  const { schemas } = components;
  const items = paths["/api/items"];

  expect(Object.keys(items.get.responses).toSorted()).toEqual(["200", "400"]);

  expectListContract(schemas, items.get);

  expectSaveContract(schemas, items.post);

  const saved = jsonSchemaOf(items.post.responses["201"] ?? { content: {} });
  expect(propertyNames(schemas, saved).toSorted()).toEqual(["item", "url"]);

  const one = paths["/api/items/{id}"];

  expect(Object.keys(one.get.responses).toSorted()).toEqual(["200", "404"]);
  expect(Object.keys(one.delete.responses).toSorted()).toEqual(["204", "400", "404"]);

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
    expect.arrayContaining(["comments", "postText", "postedAt", "highlights", "note"]),
  );
});

test("the served OpenAPI document lists every answer of the Highlight and Note routes", async ({
  request,
}, info) => {
  const { paths } = await documentOf(request, info);
  const create = paths["/api/items/{id}/highlights"].post.responses;
  const remove = paths["/api/items/{id}/highlights/{highlightId}"].delete.responses;
  const note = paths["/api/items/{id}/note"].put.responses;

  expect(Object.keys(create).toSorted()).toEqual(["200", "201", "400", "403", "404", "409", "413"]);
  expect(Object.keys(remove).toSorted()).toEqual(["204", "400", "403", "404"]);
  expect(Object.keys(note).toSorted()).toEqual(["200", "400", "403", "404", "409", "413"]);
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

test("every path of the served OpenAPI document has a route template in the copy checks", async ({
  request,
}, info) => {
  const { paths } = await documentOf(request, info);

  const unlisted = Object.keys(paths)
    .map((path) => path.replaceAll(/\{([^}]+)\}/gu, ":$1"))
    .filter((template) => routeTemplate(template) !== template);

  expect(unlisted).toEqual([]);
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
