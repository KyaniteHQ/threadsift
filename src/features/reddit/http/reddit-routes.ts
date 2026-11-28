import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import { RedditSettingsSchema } from "../../../core/contract/reddit-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import {
  jsonBody,
  jsonRequest,
  accessNote,
  accessRefusals,
  restoringResponse,
} from "../../../http/openapi.ts";
import { restoring } from "../../../http/refusals.ts";
import { readRedditSettings, saveRedditSettings } from "../core/reddit-settings.ts";

const OWNER = access("owner");

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/reddit",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      RedditSettingsSchema,
      "Whether the Reddit archive fill is on. It is on until the owner turns it off.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/reddit",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(RedditSettingsSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      RedditSettingsSchema,
      "The settings after the change. With the archive fill off, a pasted Reddit post or comment link without Extension content stays a Link-only Item; the change applies to fetches that start after it.",
    ),
    503: restoringResponse(
      "the setting is not saved, because the restore writes this setting from the zip, or clears it when the zip holds none.",
    ),
  },
});

export function registerRedditRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readRedditSettings(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const saved = await saveRedditSettings(ports, c.req.valid("json"));

    return "kind" in saved ? restoring(c) : c.json(saved, 200);
  });
}
