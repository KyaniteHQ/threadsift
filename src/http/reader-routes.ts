import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerHighlightRoutes } from "./highlight-routes.ts";
import { registerItemDetailRoute } from "./item-detail-route.ts";
import { registerNoteRoutes } from "./note-routes.ts";
import { registerReadStateRoute } from "./read-state-route.ts";

export function registerReaderRoutes(app: OpenAPIHono, ports: Ports): void {
  registerReadStateRoute(app, ports);
  registerItemDetailRoute(app, ports);
  registerHighlightRoutes(app, ports);
  registerNoteRoutes(app, ports);
}
