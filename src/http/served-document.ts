import type { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

const INFO = {
  openapi: "3.1.0",
  info: { title: "Threadsift", version: "1" },
} as const;

const JSON_PATTERNS = /"pattern":"((?:[^"\\]|\\.)*)"/gu;

const REGEX_SYNTAX = /[.*+?^${}()|[\]\\]/gu;

const SOURCES = new WeakMap<z.ZodType, readonly string[]>();

function registeredSchemas(app: OpenAPIHono) {
  return app.openAPIRegistry.definitions.flatMap((definition) => {
    if (definition.type !== "route") return [];

    const { request = {}, responses } = definition.route;

    const contents = [
      request.body?.content ?? {},
      ...Object.values(responses).map((response) =>
        "content" in response ? (response.content ?? {}) : {},
      ),
    ];

    return [
      request.params,
      request.query,
      ...contents.flatMap((content) =>
        Object.values(content).map((media) =>
          media !== undefined && "schema" in media ? media.schema : undefined,
        ),
      ),
    ].filter((schema) => schema instanceof z.ZodType);
  });
}

function sourcesOf(app: OpenAPIHono): readonly string[] {
  const sources = new Set<string>();

  for (const schema of new Set(registeredSchemas(app))) {
    const known =
      SOURCES.get(schema) ??
      (["input", "output"] as const).flatMap((io) =>
        [
          ...JSON.stringify(z.toJSONSchema(schema, { io, unrepresentable: "any" })).matchAll(
            JSON_PATTERNS,
          ),
        ].flatMap(([, source = ""]) => source),
      );

    SOURCES.set(schema, known);

    for (const source of known) sources.add(source);
  }

  return [...sources];
}

export function servedDocument(app: OpenAPIHono): string {
  const text = JSON.stringify(app.getOpenAPI31Document(INFO));
  const sources = sourcesOf(app).map((source) => source.replaceAll(REGEX_SYNTAX, String.raw`\$&`));

  if (sources.length === 0) return text;

  const flagged = new RegExp(`"pattern":"(${sources.join("|")})\\/[dgimsuvy]+"`, "gu");

  return text.replaceAll(flagged, '"pattern":"$1"');
}
