import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { SETTINGS_CHANGED } from "../../../core/contract/ai-contract.ts";
import {
  AiSettingsInputSchema,
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
} from "../../../core/contract/ai-settings-contract.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  VERIFY_WAIT_MS,
  GROK_BOT_FIRST,
  GrokBotUnreadySchema,
} from "../../../core/contract/grok-bot-contract.ts";
import { SECOND_MS } from "../../../core/contract/time-units.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest } from "../../../http/openapi.ts";
import { verifyProvider } from "../../bot/core/bot-verify.ts";
import { readAiSettings, saveAiSettings } from "../core/ai-settings.ts";

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
      `The settings changed while this save was prepared (\`error: ${SETTINGS_CHANGED}\`). Nothing from this save was written; send it again.`,
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
    const saved = await saveAiSettings(ports, c.req.valid("json"));

    switch (saved.kind) {
      case "saved":
        return c.json(saved.view, 200);
      case "refused":
        return c.json(saved, 200);
      case "provider-not-offered":
        return c.json({ error: "This Instance does not offer that Provider" }, 400);
      case "recommendation-unavailable":
        return c.json({ error: "recommendation-unavailable" }, 400);
      case "bot-first":
        return c.json({ error: GROK_BOT_FIRST, code: saved.code } as const, 400);
      case "changed":
        return c.json({ error: SETTINGS_CHANGED }, 409);
      default: {
        const exhaustive: never = saved;

        return exhaustive;
      }
    }
  });
  app.openapi(verifyRoute, async (c) => c.json(await verifyProvider(ports, c.req.raw.signal), 200));
}
