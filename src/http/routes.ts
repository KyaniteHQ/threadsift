import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { registerDeleteItemRoute } from "./delete-item-route.ts";
import { registerFileRoutes } from "./file-routes.ts";
import { registerHighlightRoutes } from "./highlight-routes.ts";
import { registerItemRoutes } from "./item-routes.ts";
import { registerSettingsRoutes } from "./settings-routes.ts";
import { registerShareRoutes } from "./share-routes.ts";

export function registerRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAccessRoutes(app, ports);
  registerItemRoutes(app, ports);
  registerDeleteItemRoute(app, ports);
  registerFileRoutes(app, ports);
  registerHighlightRoutes(app, ports);
  registerSettingsRoutes(app, ports);
  registerShareRoutes(app, ports);
}
