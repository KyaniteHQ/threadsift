import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { registerGithubRoutes } from "./github-routes.ts";
import { registerGrokBotRoutes } from "./grok-bot-routes.ts";
import { registerOpenRouterRoutes } from "./openrouter-routes.ts";
import { registerRedditAccountRoutes } from "./reddit-account-routes.ts";
import { registerRedditRoutes } from "./reddit-routes.ts";

export function registerSettingsRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAiRoutes(app, ports);
  registerOpenRouterRoutes(app, ports);
  registerGithubRoutes(app, ports);
  registerGrokBotRoutes(app, ports);
  registerRedditRoutes(app, ports);
  registerRedditAccountRoutes(app, ports);
}
