import { expect } from "@playwright/test";
import { z } from "zod";

export interface ApiSchema {
  $ref?: string | undefined;
  type?: string | undefined;
  required?: string[] | undefined;
  properties?: Record<string, ApiSchema> | undefined;
  items?: ApiSchema | undefined;
  oneOf?: ApiSchema[] | undefined;
  anyOf?: ApiSchema[] | undefined;
}

export const SchemaNode: z.ZodType<ApiSchema> = z.lazy(() =>
  z.looseObject({
    $ref: z.string().optional(),
    type: z.string().optional(),
    required: z.array(z.string()).optional(),
    properties: z.record(z.string(), SchemaNode).optional(),
    items: SchemaNode.optional(),
    oneOf: z.array(SchemaNode).optional(),
    anyOf: z.array(SchemaNode).optional(),
  }),
);

export const Body = z.looseObject({
  content: z.record(z.string(), z.looseObject({ schema: SchemaNode })),
});

export type Schemas = Record<string, ApiSchema>;

export function resolved(schemas: Schemas, node: ApiSchema): ApiSchema {
  const name = node.$ref?.replace("#/components/schemas/", "");
  const target = name === undefined ? undefined : schemas[name];

  return target === undefined ? node : resolved(schemas, target);
}

export function propertyNames(schemas: Schemas, node: ApiSchema): string[] {
  const { properties, oneOf = [], anyOf = [] } = resolved(schemas, node);

  return [
    ...new Set([
      ...Object.keys(properties ?? {}),
      ...[...oneOf, ...anyOf].flatMap((branch) => propertyNames(schemas, branch)),
    ]),
  ];
}

export function propertyOf(schemas: Schemas, node: ApiSchema, name: string): ApiSchema {
  const property = resolved(schemas, node).properties?.[name];
  expect(property, `the schema describes ${name}`).toBeDefined();

  return property ?? {};
}

export function jsonSchemaOf(body: z.infer<typeof Body>): ApiSchema {
  const schema = body.content["application/json"]?.["schema"];
  expect(schema, "an application/json body").toBeDefined();

  return schema ?? {};
}

function stringTypeOf(schemas: Schemas, node: ApiSchema, name: string): string | undefined {
  return resolved(schemas, propertyOf(schemas, node, name)).type;
}

export function expectPageSchema(schemas: Schemas, body: ApiSchema): void {
  const page = resolved(schemas, propertyOf(schemas, body, "page"));

  expect(propertyNames(schemas, page).toSorted()).toEqual([
    "author",
    "markdown",
    "published",
    "title",
    "videos",
  ]);
  expect(page.required?.toSorted()).toEqual(["markdown", "title"]);

  for (const name of ["markdown", "title", "author", "published"]) {
    expect(stringTypeOf(schemas, page, name), `${name} is a string`).toBe("string");
  }

  const videos = resolved(schemas, propertyOf(schemas, page, "videos"));

  expect(videos.type).toBe("array");
  expect(resolved(schemas, videos.items ?? {}).type, "a video address is a string").toBe("string");
}
