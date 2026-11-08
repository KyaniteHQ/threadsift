import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { Context } from "hono";

import { olderDigests } from "../core/digest-job.ts";
import { completeOpenRouterConnect } from "../core/openrouter-callback.ts";
import { startOpenRouterConnect } from "../core/openrouter-connect.ts";
import {
  CONNECT_CALLBACK_PATH,
  CONNECT_START_PATH,
  ConnectStartInputSchema,
  ConnectStartResponseSchema,
  returnAddress,
} from "../core/openrouter-contract.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";
import { sessionIdOf } from "./session-cookie.ts";

const startRoute = createRoute({
  method: "post",
  path: CONNECT_START_PATH,
  request: { body: jsonRequest(ConnectStartInputSchema) },
  responses: {
    201: jsonBody(
      ConnectStartResponseSchema,
      "The OpenRouter authorization address to send the browser to, and when this attempt expires. Only the owner's page on this Instance's own public origin may call it: the `Origin` header must equal `THREADSIFT_PUBLIC_ORIGIN` and `Sec-Fetch-Site` must be `same-origin`.",
    ),
    400: jsonBody(ErrorResponseSchema, "The body is not JSON with a model and a revision."),
    403: jsonBody(ErrorResponseSchema, "The request did not come from this Instance's own page."),
    409: jsonBody(
      ErrorResponseSchema,
      "The AI settings changed since the revision the page showed, or the session ended. No attempt was recorded.",
    ),
    503: jsonBody(
      ErrorResponseSchema,
      "Connect is unavailable: the Instance has no public origin, no usable sealing key, or a stored key it cannot open. No attempt was recorded.",
    ),
  },
});

const callbackRoute = createRoute({
  method: "get",
  path: CONNECT_CALLBACK_PATH,
  responses: {
    303: { description: "Always a redirect to Settings with a closed notice." },
    405: { description: "Only GET may complete an attempt." },
  },
});

function fromOwnPage(c: Context, origin: string): boolean {
  return (
    c.req.header("origin") === origin &&
    c.req.header("sec-fetch-site") === "same-origin" &&
    new URL(c.req.url).host === new URL(origin).host
  );
}

function registerStart(app: OpenAPIHono, ports: Ports): void {
  app.openapi(startRoute, async (c) => {
    const { publicOrigin } = ports;

    if (publicOrigin === null)
      return c.json({ error: "Connect needs THREADSIFT_PUBLIC_ORIGIN" }, 503);

    if (!fromOwnPage(c, publicOrigin))
      return c.json({ error: "Connect starts only from this Instance's own Settings page" }, 403);

    const sessionId = sessionIdOf(c);

    if (sessionId === undefined) return c.json({ error: "Sign in to connect" }, 409);

    const started = await startOpenRouterConnect(ports, { sessionId, ...c.req.valid("json") });

    switch (started.kind) {
      case "started":
        return c.json(
          { authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt },
          201,
        );
      case "stale":
        return c.json({ error: "The AI settings changed. Reload and try again" }, 409);
      case "unavailable":
        return c.json({ error: "Connect needs a public origin and a usable sealing key" }, 503);
      default: {
        const exhaustive: never = started;

        return exhaustive;
      }
    }
  });
}

function registerCallback(app: OpenAPIHono, ports: Ports): void {
  app.openapi(callbackRoute, async (c) => {
    const sessionId = sessionIdOf(c);

    if (c.req.method !== "GET") return c.body(null, 405);

    const notice =
      sessionId === undefined
        ? "incomplete"
        : await completeOpenRouterConnect(
            ports,
            { sessionId, search: new URL(c.req.url).search },
            () => olderDigests(ports.db),
          );

    return c.redirect(returnAddress(notice), 303);
  });
}

export function registerOpenRouterRoutes(app: OpenAPIHono, ports: Ports): void {
  registerStart(app, ports);
  registerCallback(app, ports);
}
