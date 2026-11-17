import { registerAiRoutes } from "./ai-routes.ts";
import { registerGithubRoutes } from "./github-routes.ts";
import { registerGrokBotRoutes } from "./grok-bot-routes.ts";
import { registerOpenRouterRoutes } from "./openrouter-routes.ts";
import { registerRedditAccountRoutes } from "./reddit-account-routes.ts";
import { registerRedditRoutes } from "./reddit-routes.ts";
import { registerVaultRoutes } from "./vault-routes.ts";
import { registerXRoutes } from "./x-routes.ts";

export const SETTINGS_ROUTES = [
  registerAiRoutes,
  registerVaultRoutes,
  registerOpenRouterRoutes,
  registerGithubRoutes,
  registerGrokBotRoutes,
  registerRedditRoutes,
  registerRedditAccountRoutes,
  registerXRoutes,
];
