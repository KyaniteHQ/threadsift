import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { SETTINGS_CHANGED } from "../../../core/contract/ai-contract.ts";
import {
  AiSettingsInputSchema,
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  MODEL_LIST_PAGES,
  ModelListRequestSchema,
  ModelListSchema,
  VerifyResultSchema,
} from "../../../core/contract/ai-settings-contract.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import {
  VERIFY_WAIT_MS,
  GROK_BOT_FIRST,
  GrokBotUnreadySchema,
} from "../../../core/contract/grok-bot-contract.ts";
import { HOP_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { SECOND_MS } from "../../../core/contract/time-units.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import {
  accessNote,
  accessRefusals,
  jsonBody,
  jsonRequest,
  restoringResponse,
} from "../../../http/openapi.ts";
import { restoring } from "../../../http/refusals.ts";
import { verifyProvider } from "../../bot/core/bot-verify.ts";
import { readAiSettings, saveAiSettings } from "../core/ai-settings.ts";
import { listModels } from "../core/provider-models.ts";

const OWNER = access("owner");

const OWNER_UNCACHED = access("owner", { cache: "no-store" });

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/ai",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      AiSettingsViewSchema,
      "Provider settings, whether a key is set, whether the Instance has a sealing key (`secretReady`) and whether that key opens the saved one (`keyReadable`).",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/ai",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(AiSettingsInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
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
    503: restoringResponse("the settings are not saved and no Digest job is queued."),
  },
});

const verifyRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/verify",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      VerifyResultSchema,
      `The verified Digest or a safe refusal category. With \`grok-bot\` as the Provider the request waits for the bot's answer for up to ${String(VERIFY_WAIT_MS / SECOND_MS)} seconds, then answers \`timeout\` and closes the task.`,
    ),
    503: restoringResponse("no verification runs."),
  },
});

const modelsRoute = createRoute({
  method: "post",
  path: "/api/settings/ai/models",
  middleware: OWNER_UNCACHED,
  description: `${accessNote(OWNER_UNCACHED)} Lists the models a Provider offers, for the AI settings. A Provider that answers over HTTP is asked with the \`key\` in the body, or else with the saved key when \`provider\` and \`baseUrl\` equal the saved ones. The key is never returned. Each outbound request waits at most ${String(HOP_DEADLINE_MS / SECOND_MS)} seconds, and Anthropic's list is read over at most ${String(MODEL_LIST_PAGES)} pages.`,
  request: { body: jsonRequest(ModelListRequestSchema) },
  responses: {
    ...accessRefusals(OWNER_UNCACHED),
    200: jsonBody(
      ModelListSchema,
      "The models (`listed`) or why none are listed (`unlisted`). A Provider's own 401 or 403 answers `unlisted` with `wrong-key`, or `key-needed` when no key was sent.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The Provider is not in `providers` of `GET /api/settings/ai`.",
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
      case "restoring":
        return restoring(c);
      default: {
        const exhaustive: never = saved;

        return exhaustive;
      }
    }
  });
  app.openapi(modelsRoute, async (c) => {
    const listed = await listModels(ports, c.req.valid("json"), c.req.raw.signal);

    return listed.kind === "not-offered"
      ? c.json({ error: "This Instance does not offer that Provider" }, 400)
      : c.json(listed, 200);
  });
  app.openapi(verifyRoute, async (c) => {
    const verified = await verifyProvider(ports, c.req.raw.signal);

    return verified.kind === "restoring" ? restoring(c) : c.json(verified, 200);
  });
}
