import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { registerFileRoutes } from "./file-routes.ts";
import { registerItemRoutes } from "./item-routes.ts";
import { registerLibraryRoutes } from "./library-routes.ts";
import { registerReaderRoutes } from "./reader-routes.ts";
import { registerSaveRoute } from "./save-route.ts";
import { registerSettingsRoutes } from "./settings-routes.ts";
import { registerShareRoutes } from "./share-routes.ts";

export function registerRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAccessRoutes(app, ports);
  registerSaveRoute(app, ports);
  registerItemRoutes(app, ports);
  registerReaderRoutes(app, ports);
  registerLibraryRoutes(app, ports);
  registerFileRoutes(app, ports);
  registerSettingsRoutes(app, ports);
  registerShareRoutes(app, ports);
}
