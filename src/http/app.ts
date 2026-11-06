import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { ZodError } from "zod";

import type { Ports } from "../core/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { guard } from "./guard.ts";
import { registerItemRoutes } from "./item-routes.ts";

const NOT_FOUND = "Not found";

function reasonOf(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
}

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonOf(result.error) }, 400),
  });

  app.use("/api/*", guard(ports));

  registerAccessRoutes(app, ports);
  registerItemRoutes(app, ports);
  registerAiRoutes(app, ports);

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

    console.error(error);

    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
