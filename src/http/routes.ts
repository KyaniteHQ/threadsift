import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/kernel/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { registerAiRoutes } from "./ai-routes.ts";
import { registerAiTaskRoutes } from "./ai-task-routes.ts";
import { registerBatchRoutes } from "./batch-routes.ts";
import { registerDeleteItemRoute } from "./delete-item-route.ts";
import { registerExportRoutes } from "./export-routes.ts";
import { registerFileRoutes } from "./file-routes.ts";
import { registerGithubRoutes } from "./github-routes.ts";
import { registerGrokBotRoutes } from "./grok-bot-routes.ts";
import { registerHighlightRoutes } from "./highlight-routes.ts";
import { registerImportRoute } from "./import-route.ts";
import { registerItemDetailRoute } from "./item-detail-route.ts";
import { registerItemRoutes } from "./item-routes.ts";
import { registerLogRoute } from "./log-route.ts";
import { registerNoteRoutes } from "./note-routes.ts";
import { registerOpenRouterRoutes } from "./openrouter-routes.ts";
import { registerProposalRoutes } from "./proposal-routes.ts";
import { registerReadStateRoute } from "./read-state-route.ts";
import { registerRedditAccountRoutes } from "./reddit-account-routes.ts";
import { registerRedditRoutes } from "./reddit-routes.ts";
import { registerRestoreRoutes } from "./restore-routes.ts";
import { registerSaveRoute } from "./save-route.ts";
import { registerShareRoutes } from "./share-routes.ts";
import { registerTopicIndexRoute } from "./topic-index-route.ts";
import { registerTopicRoutes } from "./topic-routes.ts";
import { registerVaultRoutes } from "./vault-routes.ts";
import { registerXRoutes } from "./x-routes.ts";

export function registerRoutes(app: OpenAPIHono, ports: Ports): void {
  for (const register of [
    registerAccessRoutes,
    registerSaveRoute,
    registerItemRoutes,
    registerReadStateRoute,
    registerItemDetailRoute,
    registerHighlightRoutes,
    registerNoteRoutes,
    registerBatchRoutes,
    registerImportRoute,
    registerDeleteItemRoute,
    registerExportRoutes,
    registerLogRoute,
    registerProposalRoutes,
    registerRestoreRoutes,
    registerTopicIndexRoute,
    registerTopicRoutes,
    registerFileRoutes,
    registerAiRoutes,
    registerVaultRoutes,
    registerOpenRouterRoutes,
    registerGithubRoutes,
    registerAiTaskRoutes,
    registerGrokBotRoutes,
    registerRedditRoutes,
    registerRedditAccountRoutes,
    registerXRoutes,
    registerShareRoutes,
  ]) {
    register(app, ports);
  }
}
