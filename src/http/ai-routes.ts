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
import { ErrorResponseSchema } from "./schemas.ts";

const PROVIDER_UNAVAILABLE = "This Instance does not offer that Provider";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  responses: {
    200: jsonBody(
      AiSettingsViewSchema,
      "Provider settings, whether a key is set, whether the Instance has a sealing key (`secretReady`) and whether that key opens the saved one (`keyReadable`).",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/ai",
  request: { body: jsonRequest(AiSettingsInputSchema) },
  responses: {
    200: jsonBody(
      AiSaveResponseSchema,
      "Settings or a safe refusal category. No secret is returned. A Provider that `GET /api/settings/ai` does not list in `providers` is never saved.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The Provider is not in `providers` of `GET /api/settings/ai`, such as `workers-ai` on the container. Nothing is saved and no Digest job is queued.",
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
  app.openapi(saveRoute, async (c) => {
    const input = c.req.valid("json");

    if (!ports.ai.providers.includes(input.provider))
      return c.json({ error: PROVIDER_UNAVAILABLE }, 400);

    return c.json(await saveAiSettings(ports, input, () => olderDigests(ports.db)), 200);
  });
  app.openapi(verifyRoute, async (c) => c.json(await verifyAi(ports, c.req.raw.signal), 200));
}
