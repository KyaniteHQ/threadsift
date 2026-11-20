import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { providersOf } from "../core/ai/ai-run.ts";
import { readAiSettings, saveAiSettings } from "../core/ai/ai-settings.ts";
import { verifyProvider } from "../core/bot/bot-verify.ts";
import {
  AiSettingsInputSchema,
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../core/contract/ai-settings-contract.ts";
import {
  VERIFY_WAIT_MS,
  GROK_BOT_FIRST,
  GrokBotUnreadySchema,
} from "../core/contract/grok-bot-contract.ts";
import { SECOND_MS } from "../core/contract/time-units.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { access } from "./access.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const PROVIDER_UNAVAILABLE = "This Instance does not offer that Provider";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  middleware: access("owner"),
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
  middleware: access("owner"),
  request: { body: jsonRequest(AiSettingsInputSchema) },
  responses: {
    200: jsonBody(
      AiSaveResponseSchema,
      "Settings or a safe refusal category. No secret is returned. A Provider that `GET /api/settings/ai` does not list in `providers` is never saved.",
    ),
    400: jsonBody(
      z.union([ErrorResponseSchema, GrokBotUnreadySchema]),
      "The Provider is not in `providers` of `GET /api/settings/ai`, such as `workers-ai` on the container; the CLI has no recommendation to select (`error: recommendation-unavailable`); or the Provider is `grok-bot` and the Grok Bot settings are not saved (`code: not-configured`) or their key cannot be opened (`code: secret-missing`). Nothing is saved and no Digest job is queued.",
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "The settings changed while this save was prepared (`error: settings-changed`). Nothing from this save was written; send it again.",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/verify",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      VerifyResultSchema,
      `The verified Digest or a safe refusal category. With \`grok-bot\` as the Provider the request waits for the bot's answer for up to ${String(VERIFY_WAIT_MS / SECOND_MS)} seconds (\`VERIFY_WAIT_MS\` in \`src/core/grok-bot-contract.ts\`), then answers \`timeout\` and closes the task.`,
    ),
  },
});

export function registerAiRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readAiSettings(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const input = c.req.valid("json");

    if (!providersOf(ports.ai).includes(input.provider))
      return c.json({ error: PROVIDER_UNAVAILABLE }, 400);

    const saved = await saveAiSettings(ports, input);

    if ("kind" in saved && saved.kind === "changed")
      return c.json({ error: "settings-changed" }, 409);

    if ("kind" in saved && saved.kind === "recommendation-unavailable")
      return c.json({ error: "recommendation-unavailable" }, 400);

    if ("kind" in saved && saved.kind === "bot-first")
      return c.json({ error: GROK_BOT_FIRST, code: saved.code } as const, 400);

    return c.json(saved, 200);
  });
  app.openapi(verifyRoute, async (c) => c.json(await verifyProvider(ports, c.req.raw.signal), 200));
}
