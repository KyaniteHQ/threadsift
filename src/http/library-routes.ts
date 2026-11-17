import { registerBatchRoutes } from "./batch-routes.ts";
import { registerDeleteItemRoute } from "./delete-item-route.ts";
import { registerExportRoutes } from "./export-routes.ts";
import { registerLogRoute } from "./log-route.ts";
import { registerProposalRoutes } from "./proposal-routes.ts";
import { registerRestoreRoutes } from "./restore-routes.ts";
import { registerTopicIndexRoute } from "./topic-index-route.ts";
import { registerTopicRoutes } from "./topic-routes.ts";

export const LIBRARY_ROUTES = [
  registerBatchRoutes,
  registerDeleteItemRoute,
  registerExportRoutes,
  registerLogRoute,
  registerProposalRoutes,
  registerRestoreRoutes,
  registerTopicIndexRoute,
  registerTopicRoutes,
];
