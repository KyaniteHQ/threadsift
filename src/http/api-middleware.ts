import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";

import {
  CONNECT_CALLBACK_PATH,
  CONNECT_START_PATH,
  returnAddress,
} from "../core/openrouter-contract.ts";
import type { Ports } from "../core/ports.ts";
import { guard } from "./guard.ts";

const privateResponse: MiddlewareHandler = async (c, next) => {
  await next();

  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Referrer-Policy", "no-referrer");
};

const FILE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
} as const;

const privateFile: MiddlewareHandler = async (c, next) => {
  await next();

  for (const [name, value] of Object.entries(FILE_HEADERS)) {
    c.res.headers.set(name, value);
  }
};

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
  app.use("/api/files/*", privateFile);
  app.use("/api/*", guard(ports));
}
