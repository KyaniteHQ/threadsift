import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import {
  AiSettingsInputSchema,
  GROK_BOT_PROVIDER,
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../core/ai-contract.ts";
import { readAiSettings, saveAiSettings } from "../core/ai-settings.ts";
import { verifyProvider } from "../core/bot-verify.ts";
import { olderDigests } from "../core/digest-job.ts";
import { GROK_BOT_FIRST, GrokBotUnreadySchema } from "../core/grok-bot-contract.ts";
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
      z.union([ErrorResponseSchema, GrokBotUnreadySchema]),
      "The Provider is not in `providers` of `GET /api/settings/ai`, such as `workers-ai` on the container; or the Provider is `grok-bot` and the Grok Bot settings are not saved (`code: not-configured`) or their key cannot be opened (`code: secret-missing`). Nothing is saved and no Digest job is queued.",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/verify",
  responses: {
    200: jsonBody(
      VerifyResultSchema,
      "The verified Digest or a safe refusal category. With `grok-bot` as the Provider the request waits for the bot's answer for up to 60 seconds (`VERIFY_WAIT_MS` in `src/core/grok-bot-contract.ts`), then answers `timeout` and closes the task.",
    ),
  },
});

export function registerAiRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readAiSettings(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const input = c.req.valid("json");

    if (!ports.ai.providers.includes(input.provider))
      return c.json({ error: PROVIDER_UNAVAILABLE }, 400);

    const saved = await saveAiSettings(ports, input, () => olderDigests(ports.db));

    if ("kind" in saved && input.provider === GROK_BOT_PROVIDER)
      return c.json(
        {
          error: GROK_BOT_FIRST,
          code: saved.reason === "secret-missing" ? saved.reason : "not-configured",
        } as const,
        400,
      );

    return c.json(saved, 200);
  });
  app.openapi(verifyRoute, async (c) => c.json(await verifyProvider(ports, c.req.raw.signal), 200));
}
