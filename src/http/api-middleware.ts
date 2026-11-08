import type { OpenAPIHono } from "@hono/zod-openapi";

import { CONNECT_CALLBACK_PATH } from "../core/openrouter-contract.ts";
import type { Ports } from "../core/ports.ts";
import { guard } from "./guard.ts";
import { callbackResponse } from "./openrouter-routes.ts";

export function installApiMiddleware(app: OpenAPIHono, ports: Ports): void {
  app.use(CONNECT_CALLBACK_PATH, callbackResponse);
  app.use("/api/*", guard(ports));
}
