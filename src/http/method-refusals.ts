import type { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { methodNotAllowed } from "hono/method-not-allowed";

import { notAllowed } from "./refusals.ts";

export const getOnly = createMiddleware(async (c, next) => {
  const refusal = c.req.method === "HEAD" ? notAllowed(c, ["GET"]) : undefined;

  if (refusal === undefined) await next();

  return refusal;
});

export function refusingMethods(app: OpenAPIHono): MiddlewareHandler {
  return methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) => {
      const headRefused = app.router
        .match("GET", c.req.path)[0]
        .some(([[handler]]) => handler === getOnly);

      return notAllowed(c, headRefused ? methods.filter((method) => method !== "HEAD") : methods);
    },
  });
}
