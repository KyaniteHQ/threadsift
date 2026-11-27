import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/kernel/ports.ts";
import { registerAccessRoutes } from "../features/access/http/access-routes.ts";
import { registerAiRoutes } from "../features/ai/http/ai-routes.ts";
import { registerAiTaskRoutes } from "../features/ai/http/ai-task-routes.ts";
import { registerGrokBotRoutes } from "../features/ai/http/grok-bot-routes.ts";
import { registerOpenRouterRoutes } from "../features/ai/http/openrouter-routes.ts";
import { registerBotInstallRoutes } from "../features/bot/http/bot-install-routes.ts";
import { registerExportRoutes } from "../features/export/http/export-routes.ts";
import { registerGithubRoutes } from "../features/github/http/github-routes.ts";
import { registerDeleteItemRoute } from "../features/item/http/delete-item-route.ts";
import { registerHighlightRoutes } from "../features/item/http/highlight-routes.ts";
import { registerItemDetailRoute } from "../features/item/http/item-detail-route.ts";
import { registerItemRoutes } from "../features/item/http/item-routes.ts";
import { registerNoteRoutes } from "../features/item/http/note-routes.ts";
import { registerReadStateRoute } from "../features/item/http/read-state-route.ts";
import { registerFileRoutes } from "../features/media/http/file-routes.ts";
import { registerBatchRoutes } from "../features/paste/http/batch-routes.ts";
import { registerImportRoute } from "../features/paste/http/import-route.ts";
import { registerSaveRoute } from "../features/paste/http/save-route.ts";
import { registerShareRoutes } from "../features/paste/http/share-routes.ts";
import { registerRedditAccountRoutes } from "../features/reddit/http/reddit-account-routes.ts";
import { registerRedditRoutes } from "../features/reddit/http/reddit-routes.ts";
import { registerRestoreRoutes } from "../features/restore/http/restore-routes.ts";
import { registerVaultRoutes } from "../features/vault/http/vault-routes.ts";
import { registerLogRoute } from "../features/wiki/http/log-route.ts";
import { registerProposalRoutes } from "../features/wiki/http/proposal-routes.ts";
import { registerTopicIndexRoute } from "../features/wiki/http/topic-index-route.ts";
import { registerTopicRoutes } from "../features/wiki/http/topic-routes.ts";
import { registerXRoutes } from "../features/x/http/x-routes.ts";

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
    registerBotInstallRoutes,
    registerRedditRoutes,
    registerRedditAccountRoutes,
    registerXRoutes,
    registerShareRoutes,
  ]) {
    register(app, ports);
  }
}
