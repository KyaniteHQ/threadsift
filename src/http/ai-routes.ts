import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  AiSettingsInputSchema,
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../core/ai-contract.ts";
import { readAiSettings, saveAiSettings } from "../core/ai-settings.ts";
import { verifyAi } from "../core/ai-tasks.ts";
import { olderDigests } from "../core/digest-job.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  responses: { 200: jsonBody(AiSettingsViewSchema, "Provider settings and whether a key is set.") },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/ai",
  request: { body: jsonRequest(AiSettingsInputSchema) },
  responses: {
    200: jsonBody(
      AiSaveResponseSchema,
      "Settings or a safe refusal category. No secret is returned.",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/verify",
  responses: {
    200: jsonBody(VerifyResultSchema, "The verified Digest or a safe refusal category."),
  },
});

export function registerAiRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readAiSettings(ports), 200));
  app.openapi(saveRoute, async (c) =>
    c.json(await saveAiSettings(ports, c.req.valid("json"), () => olderDigests(ports.db)), 200),
  );
  app.openapi(verifyRoute, async (c) => c.json(await verifyAi(ports, c.req.raw.signal), 200));
}
