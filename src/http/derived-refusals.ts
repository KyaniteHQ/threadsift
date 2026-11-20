import type { OpenAPIHono } from "@hono/zod-openapi";
import type { H } from "hono/types";
import { z } from "zod";

import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import { CSRF_FORM_TYPES, CSRF_SAFE_METHODS, type OriginCheck } from "./access-steps.ts";
import { originCheckOf, tooLargeOf, whoOf } from "./access.ts";
import { codeList, jsonBody } from "./openapi.ts";

const FORM_TYPES = codeList(CSRF_FORM_TYPES);

const CROSS_SITE_FORM = `A call whose content type is one of ${FORM_TYPES}, or is missing, and that carries neither \`Sec-Fetch-Site: same-origin\` nor an \`Origin\` header equal to this Instance's own origin, is refused with 403 and an \`error\` of \`Forbidden\`, so that a page of another site cannot submit a form to this route.`;

const ORIGIN_SENTENCES = {
  always: CROSS_SITE_FORM,
  "unless-authorization": `${CROSS_SITE_FORM} A call with an \`Authorization\` header skips this check, and the credential check answers first, so a call with neither a session nor a token gets 401.`,
} satisfies Readonly<Record<Exclude<OriginCheck, "none">, string>>;

const INVALID = {
  body: "a JSON body is malformed or does not match the request schema",
  query: "a query parameter does not match its schema",
  params: "a path parameter does not match its schema",
};

const PLAIN_PROPERTY_KEYS: ReadonlySet<string> = new Set(["type", "description"]);

const FAILING_PARAMS = new WeakMap<z.ZodType, boolean>();

function handlersByRoute(app: OpenAPIHono): ReadonlyMap<string, readonly H[]> {
  const grouped = new Map<string, H[]>();

  for (const { method, path, handler } of app.routes) {
    const key = `${method} ${path}`;

    grouped.set(key, [...(grouped.get(key) ?? []), handler]);
  }

  return grouped;
}

function failingParams(app: OpenAPIHono): ReadonlySet<z.ZodType> {
  const failing = new Set<z.ZodType>();

  for (const definition of app.openAPIRegistry.definitions) {
    const params = definition.type === "route" ? definition.route.request?.params : undefined;

    if (params === undefined) continue;

    const known =
      FAILING_PARAMS.get(params) ??
      Object.values(z.toJSONSchema(params, INPUT_SCHEMA).properties ?? {}).some((property) =>
        Object.keys(property).some((key) => !PLAIN_PROPERTY_KEYS.has(key)),
      );

    FAILING_PARAMS.set(params, known);

    if (known) failing.add(params);
  }

  return failing;
}

const INPUT_SCHEMA = { io: "input", unrepresentable: "any" } as const;

interface RouteInputs {
  readonly method: string;
  readonly handlers: readonly H[];
  readonly bodyTypes: readonly string[] | null;
  readonly query: boolean;
  readonly params: boolean;
}

function derivedTexts({ method, handlers, bodyTypes, query, params }: Readonly<RouteInputs>) {
  const origin = handlers
    .map((handler) => originCheckOf(handler))
    .find((found) => found !== "none");

  const tooLarge = handlers
    .map((handler) => tooLargeOf(handler))
    .find((found) => found !== undefined);

  const taskGate = handlers.some((handler) => whoOf(handler) === "callback");
  const readsJson = bodyTypes !== null && bodyTypes.some((type) => type.includes("json"));
  const unsafe = !CSRF_SAFE_METHODS.includes(method);

  const invalid = [
    ...(readsJson ? [INVALID.body] : []),
    ...(query ? [INVALID.query] : []),
    ...(params && !taskGate ? [INVALID.params] : []),
  ];

  return [
    ...(invalid.length === 0
      ? []
      : [
          [
            "400",
            `A request is refused with 400 and an \`error\` that lists the reasons when ${invalid.join(", or when ")}. Nothing is changed.`,
          ] as const,
        ]),
    ...(origin === undefined || !unsafe ? [] : [["403", ORIGIN_SENTENCES[origin]] as const]),
    ...(!unsafe || tooLarge === undefined ? [] : [["413", `${tooLarge}.`] as const]),
    ...(readsJson
      ? [
          [
            "415",
            `A body whose content type is not ${codeList(bodyTypes ?? [])}, or that has none, is refused with 415.`,
          ] as const,
        ]
      : []),
  ];
}

export function describeDerivedRefusals(app: OpenAPIHono): void {
  const handlers = handlersByRoute(app);
  const failing = failingParams(app);

  for (const definition of app.openAPIRegistry.definitions) {
    if (definition.type !== "route") continue;

    const { route } = definition;
    const { body, query, params } = route.request ?? {};

    const texts = derivedTexts({
      method: route.method,
      handlers:
        handlers.get(
          `${route.method.toUpperCase()} ${route.path.replaceAll(/\/\{(.+?)\}/gu, "/:$1")}`,
        ) ?? [],
      bodyTypes: body === undefined ? null : Object.keys(body.content),
      query: query !== undefined,
      params: params !== undefined && failing.has(params),
    });

    const current = route.responses;

    definition.route.responses = {
      ...current,
      ...Object.fromEntries(
        texts.map(([status, text]) => {
          const existing = current[status];
          const own =
            existing !== undefined && "content" in existing ? existing.content : undefined;
          const media = own?.["application/json"];
          const schema = media !== undefined && "schema" in media ? media.schema : undefined;

          if (schema instanceof z.ZodType && !schema.safeParse({ error: text }).success) {
            throw new Error(
              `${route.method.toUpperCase()} ${route.path} lists a ${status} whose schema rejects the derived ${status} answer`,
            );
          }

          return [
            status,
            existing !== undefined && "description" in existing
              ? { ...existing, description: `${existing.description} ${text}` }
              : jsonBody(ErrorResponseSchema, text),
          ];
        }),
      ),
    };
  }
}
