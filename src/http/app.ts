import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { logFailure } from "../core/failure-log.ts";
import type { Ports } from "../core/ports.ts";
import { reasonsOf } from "../core/zod-reasons.ts";
import { installApiMiddleware } from "./api-middleware.ts";
import { mcpRoute } from "./mcp-route.ts";
import { notFound } from "./refusals.ts";
import { registerRoutes } from "./routes.ts";

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonsOf(result.error) }, 400),
  });

  installApiMiddleware(app, ports);

  registerRoutes(app, ports);

  app.route("/", mcpRoute(ports));

  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Threadsift", version: "1" },
  });

  app.all("/api/*", notFound);

  app.onError(async (error, c) => {
    if (error instanceof HTTPException) {
      const refusal = error.getResponse();

      if (refusal.headers.get("content-type")?.includes("application/json") === true) {
        return refusal;
      }

      return c.json({ error: (await refusal.text()) || "Request refused" }, error.status);
    }

    logFailure("request-failed", { path: c.req.path }, error);

    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
