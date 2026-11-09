import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";

import { FILE_ROUTE } from "../core/file-keys.ts";
import {
  CONNECT_CALLBACK_PATH,
  CONNECT_START_PATH,
  returnAddress,
} from "../core/openrouter-contract.ts";
import type { Ports } from "../core/ports.ts";
import { guard } from "./guard.ts";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const FILE_HEADERS = {
  ...PRIVATE_HEADERS,
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
} as const;

function privateWith(headers: Readonly<Record<string, string>>): MiddlewareHandler {
  return async (c, next) => {
    await next();

    for (const [name, value] of Object.entries(headers)) {
      c.res.headers.set(name, value);
    }
  };
}

const privateResponse = privateWith(PRIVATE_HEADERS);

const privateFile = privateWith(FILE_HEADERS);

const signedOutNavigation: MiddlewareHandler = async (c, next) => {
  await next();

  const navigating =
    c.req.method === "GET" &&
    c.res.status === 401 &&
    c.req.header("authorization") === undefined &&
    c.req.header("sec-fetch-mode") === "navigate";

  if (navigating) {
    c.res = new Response(null, { status: 303, headers: { location: returnAddress(null) } });
  }
};

export function installApiMiddleware(app: OpenAPIHono, ports: Ports): void {
  app.use(CONNECT_START_PATH, privateResponse);
  app.use(CONNECT_CALLBACK_PATH, privateResponse, signedOutNavigation);
  app.use(`${FILE_ROUTE}*`, privateFile);
  app.use("/api/*", guard(ports));
}
