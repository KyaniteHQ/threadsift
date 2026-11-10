import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import { RedditSettingsSchema } from "../core/reddit-contract.ts";
import { readRedditSettings, saveRedditSettings } from "../core/reddit-settings.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/reddit",
  responses: {
    200: jsonBody(
      RedditSettingsSchema,
      "Whether the Reddit archive fill is on. It is on until the owner turns it off.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/reddit",
  request: { body: jsonRequest(RedditSettingsSchema) },
  responses: {
    200: jsonBody(
      RedditSettingsSchema,
      "The settings after the change. With the archive fill off, a pasted Reddit post or comment link without Extension content stays a Link-only Item; the change applies to fetches that start after it.",
    ),
  },
});

export function registerRedditRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readRedditSettings(ports), 200));
  app.openapi(saveRoute, async (c) =>
    c.json(await saveRedditSettings(ports, c.req.valid("json")), 200),
  );
}
