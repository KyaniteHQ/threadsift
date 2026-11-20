import { OpenAPIHono } from "@hono/zod-openapi";

import { reasonsOf } from "../core/contract/zod-reasons.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { access, unrouted, withPorts } from "./access.ts";
import { registerMcpRoute } from "./mcp-route.ts";
import { refusingMethods } from "./method-refusals.ts";
import { verifyPolicies } from "./policy-check.ts";
import { answerFailure, notFound } from "./refusals.ts";
import { registerRoutes } from "./routes.ts";

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Threadsift", version: "1" },
} as const;

export function createApp(ports: Ports): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) =>
      result.success ? undefined : c.json({ error: reasonsOf(result.error) }, 400),
  });

  app.use("/*", withPorts(ports));

  registerRoutes(app, ports);

  registerMcpRoute(app, ports);

  app.get("/api/openapi.json", access("read"), (c) => c.json(app.getOpenAPI31Document(DOCUMENT)));

  const refusing = refusingMethods(app);

  app.all("/api/*", unrouted(), refusing, notFound);

  app.all("/*", access("self"), refusing);

  app.onError(answerFailure);

  verifyPolicies(app);

  return app;
}
