import type { z } from "zod";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  ModelListSchema,
  VerifyResultSchema,
  type AiSettingsInput,
  type ModelList,
  type ModelListRequest,
} from "../../src/core/contract/ai-settings-contract.ts";
import { GrokBotUnreadySchema } from "../../src/core/contract/grok-bot-contract.ts";
import {
  CONNECT_START_PATH,
  ConnectStartResponseSchema,
  type ConnectStartInput,
} from "../../src/core/contract/openrouter-contract.ts";
import { call, parsedBody, parsedFrom, post, put } from "./calls.ts";
import { RESTORING, type Restoring, callUnlessRestoring, isRestoring } from "./unavailable.ts";
import {
  AI_SAVE_DEADLINE_MS,
  AI_VERIFY_DEADLINE_MS,
  DATABASE_WRITE_DEADLINE_MS,
  MODEL_LIST_DEADLINE_MS,
} from "./write-deadlines.ts";

export type AiView = z.infer<typeof AiSettingsViewSchema>;

type VerifyResult = z.infer<typeof VerifyResultSchema>;

export function fetchAiSettings(signal?: AbortSignal): Promise<AiView> {
  return parsedFrom("GET", "/api/settings/ai", AiSettingsViewSchema, { signal });
}

type GrokBotUnready = z.infer<typeof GrokBotUnreadySchema>;

type AiSave =
  | z.infer<typeof AiSaveResponseSchema>
  | { readonly kind: "grok-bot-unready"; readonly code: GrokBotUnready["code"] }
  | Restoring;

export async function saveAiSettings(input: Readonly<AiSettingsInput>): Promise<AiSave> {
  const response = await callUnlessRestoring(put(AI_SAVE_DEADLINE_MS), "/api/settings/ai", {
    json: input,
    tolerates: [400],
  });

  if (isRestoring(response)) return RESTORING;

  if (response.status !== 400) return parsedBody(response, AiSaveResponseSchema);

  const unready = GrokBotUnreadySchema.safeParse(await response.json());

  if (!unready.success) throw new Error("PUT /api/settings/ai answered 400");

  return { kind: "grok-bot-unready", code: unready.data.code };
}

export function listAiModels(input: Readonly<ModelListRequest>): Promise<ModelList> {
  return parsedFrom(post(MODEL_LIST_DEADLINE_MS), "/api/settings/ai/models", ModelListSchema, {
    json: input,
  });
}

type Verification = VerifyResult | Restoring;

export async function verifyAi(): Promise<Verification> {
  const response = await callUnlessRestoring(
    post(AI_VERIFY_DEADLINE_MS),
    "/api/settings/ai/verify",
  );

  if (isRestoring(response)) return RESTORING;

  return parsedBody(response, VerifyResultSchema);
}

type ConnectStart =
  | { readonly kind: "started"; readonly authorizationUrl: string }
  | { readonly kind: "stale" | "unavailable" | "failed" };

export async function startConnect(input: Readonly<ConnectStartInput>): Promise<ConnectStart> {
  const response = await call(post(DATABASE_WRITE_DEADLINE_MS), CONNECT_START_PATH, {
    json: input,
  });

  if (response.status === 201)
    return {
      kind: "started",
      authorizationUrl: (await parsedBody(response, ConnectStartResponseSchema)).authorizationUrl,
    };

  if (response.status === 409) return { kind: "stale" };

  return { kind: response.status === 503 ? "unavailable" : "failed" };
}
