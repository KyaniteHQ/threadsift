import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { XSettingsViewSchema, readXSettings } from "../core/x-settings.ts";
import { jsonBody } from "./openapi.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/x",
  responses: {
    200: jsonBody(
      XSettingsViewSchema,
      "Which fetcher answers X links, its state, and the version it reported. The fetcher is null on the Worker and on a container without the grok CLI, and then X links stay Link-only. The state is a hint read from the CLI, never a credential.",
    ),
  },
});

export function registerXRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readXSettings(ports), 200));
}
