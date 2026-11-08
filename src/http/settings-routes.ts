import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { registerGithubRoutes } from "./github-routes.ts";

export function registerSettingsRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAiRoutes(app, ports);
  registerGithubRoutes(app, ports);
}
