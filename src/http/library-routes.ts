import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerBatchRoutes } from "./batch-routes.ts";
import { registerDeleteItemRoute } from "./delete-item-route.ts";
import { registerLogRoute } from "./log-route.ts";
import { registerTopicIndexRoute } from "./topic-index-route.ts";
import { registerTopicRoutes } from "./topic-routes.ts";

export function registerLibraryRoutes(app: OpenAPIHono, ports: Ports): void {
  registerBatchRoutes(app, ports);
  registerDeleteItemRoute(app, ports);
  registerLogRoute(app, ports);
  registerTopicIndexRoute(app, ports);
  registerTopicRoutes(app, ports);
}
