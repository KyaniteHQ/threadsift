import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  XApiLimitsInputSchema,
  XApiSaveResponseSchema,
  XApiSettingsViewSchema,
  XApiTokenInputSchema,
  XApiVerifyResultSchema,
} from "../../../core/contract/x-api-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest, accessNote, accessRefusals } from "../../../http/openapi.ts";
import {
  readXApiSettings,
  removeXApiToken,
  saveXApiLimits,
  saveXApiToken,
  verifyXApiToken,
} from "../core/x-api-token.ts";

const OWNER = access("owner");

const PATH = "/api/settings/x-api";

const VIEW =
  "Whether an X API Bearer token is saved, missing or unreadable, whether this Instance has a usable sealing key, the spend limits per Item and per UTC day in millionths of a US dollar, and what the counter holds for today (UTC): the counted micro-dollars, posts and users, at X's prices of 0.005 USD a post and 0.010 USD a user. The counter counts every post and user an answer returned, so it can be above X's bill, which counts a resource once a UTC day. No token is returned.";

const readRoute = createRoute({
  method: "get",
  path: PATH,
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: { ...accessRefusals(OWNER), 200: jsonBody(XApiSettingsViewSchema, VIEW) },
});

const saveRoute = createRoute({
  method: "put",
  path: PATH,
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(XApiTokenInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XApiSaveResponseSchema,
      "The settings after the Bearer token is saved or replaced, sealed like the other secrets, or the refusal `secret-missing` when the Instance has no usable sealing key. With a token saved and neither a ready Grok Bot nor the grok CLI, `auto` reads X links through the X API, which spends the owner's X credit.",
    ),
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: PATH,
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XApiSettingsViewSchema,
      "The settings after the token is removed. The limits and the counter stay. Removing when none is saved also succeeds.",
    ),
  },
});

const limitsRoute = createRoute({
  method: "put",
  path: `${PATH}/limits`,
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(XApiLimitsInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XApiSettingsViewSchema,
      "The settings after the limits are saved. A read sends no request whose worst case could pass the limit per Item or what is left of the limit for the UTC day.",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: `${PATH}/verify`,
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      XApiVerifyResultSchema,
      "The credit balance in US dollars from X's `GET /2/usage/credits`, which reads no post, or a safe refusal. X's own 401 is a refusal inside this 200, so it never signs the owner out.",
    ),
  },
});

export function registerXApiRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readXApiSettings(ports), 200));
  app.openapi(saveRoute, async (c) => c.json(await saveXApiToken(ports, c.req.valid("json")), 200));
  app.openapi(removeRoute, async (c) => c.json(await removeXApiToken(ports), 200));
  app.openapi(limitsRoute, async (c) =>
    c.json(await saveXApiLimits(ports, c.req.valid("json")), 200),
  );
  app.openapi(verifyRoute, async (c) =>
    c.json(await verifyXApiToken(ports, c.req.raw.signal), 200),
  );
}
