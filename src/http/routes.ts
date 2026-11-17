import type { OpenAPIHono } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { registerAccessRoutes } from "./access-routes.ts";
import { registerFileRoutes } from "./file-routes.ts";
import { registerItemRoutes } from "./item-routes.ts";
import { LIBRARY_ROUTES } from "./library-routes.ts";
import { READER_ROUTES } from "./reader-routes.ts";
import { registerSaveRoute } from "./save-route.ts";
import { SETTINGS_ROUTES } from "./settings-routes.ts";
import { registerShareRoutes } from "./share-routes.ts";

export function registerRoutes(app: OpenAPIHono, ports: Ports): void {
  for (const register of [
    registerAccessRoutes,
    registerSaveRoute,
    registerItemRoutes,
    ...READER_ROUTES,
    ...LIBRARY_ROUTES,
    registerFileRoutes,
    ...SETTINGS_ROUTES,
    registerShareRoutes,
  ]) {
    register(app, ports);
  }
}
