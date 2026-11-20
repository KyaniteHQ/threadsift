import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  CONNECT_CALLBACK_PATH,
  CONNECT_START_PATH,
  ConnectStartInputSchema,
  ConnectStartResponseSchema,
  returnAddress,
} from "../../../core/contract/openrouter-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { getOnly } from "../../../http/method-refusals.ts";
import { accessNote, accessRefusals, jsonBody, jsonRequest } from "../../../http/openapi.ts";
import { senderOf } from "../../../http/sender.ts";
import { sessionIdOf } from "../../../http/session-cookie.ts";
import { completeOpenRouterConnect } from "../core/openrouter-callback.ts";
import { startOpenRouterConnect } from "../core/openrouter-connect.ts";

const START = access("owner", { cache: "private" });

const CALLBACK = access("owner", {
  cache: "private",
  signedOutNavigation: returnAddress(null),
});

const startRoute = createRoute({
  method: "post",
  path: CONNECT_START_PATH,
  middleware: START,
  description: accessNote(START),
  request: { body: jsonRequest(ConnectStartInputSchema) },
  responses: {
    ...accessRefusals(
      START,
      " The request is also refused when it did not come from this Instance's own page.",
    ),
    201: jsonBody(
      ConnectStartResponseSchema,
      "The OpenRouter authorization address to send the browser to, and when this attempt expires. Only the owner's page on this Instance's own public origin may call it: the `Origin` header must equal `THREADSIFT_PUBLIC_ORIGIN` and `Sec-Fetch-Site` must be `same-origin`.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "The AI settings changed since the revision the page showed, or the session ended. No attempt was recorded.",
    ),
    503: jsonBody(
      ErrorResponseSchema,
      "Connect is unavailable: the Instance has no public origin or no usable sealing key. No attempt was recorded.",
    ),
  },
});

const callbackRoute = createRoute({
  method: "get",
  path: CONNECT_CALLBACK_PATH,
  middleware: [CALLBACK, getOnly],
  description: accessNote(CALLBACK),
  responses: {
    ...accessRefusals(CALLBACK),
    303: {
      description:
        "A redirect to Settings with a closed notice. A browser navigation with no owner session is redirected to Settings without a notice, and the callback does not run.",
    },
    405: {
      description:
        "With the owner's session, any method but GET answers 405 with `Allow: GET`, and a HEAD completes no attempt. Only GET may complete an attempt.",
    },
  },
});

function registerStart(app: OpenAPIHono, ports: Ports): void {
  app.openapi(startRoute, async (c) => {
    const started = await startOpenRouterConnect(ports, {
      sender: senderOf(c),
      sessionId: sessionIdOf(c),
      ...c.req.valid("json"),
    });

    switch (started.kind) {
      case "started":
        return c.json(
          { authorizationUrl: started.authorizationUrl, expiresAt: started.expiresAt },
          201,
        );
      case "no-origin":
        return c.json({ error: "Connect needs THREADSIFT_PUBLIC_ORIGIN" }, 503);
      case "not-own-page":
        return c.json({ error: "Connect starts only from this Instance's own Settings page" }, 403);
      case "no-session":
        return c.json({ error: "Sign in to connect" }, 409);
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
    const notice = await completeOpenRouterConnect(ports, {
      sessionId: sessionIdOf(c),
      search: new URL(c.req.url).search,
    });

    return c.redirect(returnAddress(notice), 303);
  });
}

export function registerOpenRouterRoutes(app: OpenAPIHono, ports: Ports): void {
  registerStart(app, ports);
  registerCallback(app, ports);
}
