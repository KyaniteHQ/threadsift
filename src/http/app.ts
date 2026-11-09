import { OpenAPIHono, type z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

import { logFailure } from "../core/failure-log.ts";
import type { Ports } from "../core/ports.ts";
import { installApiMiddleware } from "./api-middleware.ts";
import { NOT_FOUND } from "./item-routes.ts";
import { registerRoutes } from "./routes.ts";

function reasonOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonOf(result.error) }, 400),
  });

  installApiMiddleware(app, ports);

  registerRoutes(app, ports);

  app.doc("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Threadsift", version: "1" },
  });

  app.all("/api/*", (c) => c.json({ error: NOT_FOUND }, 404));

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
