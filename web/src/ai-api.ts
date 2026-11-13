import type { z } from "zod";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
  type AiSettingsInput,
} from "../../src/core/ai-contract.ts";
import { GrokBotUnreadySchema } from "../../src/core/grok-bot-contract.ts";
import {
  CONNECT_START_PATH,
  ConnectStartResponseSchema,
  type ConnectStartInput,
} from "../../src/core/openrouter-contract.ts";
import { call, callOk, parsedBody, parsedFrom } from "./calls.ts";

export type AiView = z.infer<typeof AiSettingsViewSchema>;

type VerifyResult = z.infer<typeof VerifyResultSchema>;

export function fetchAiSettings(signal: AbortSignal): Promise<AiView> {
  return parsedFrom("GET", "/api/settings/ai", AiSettingsViewSchema, { signal });
}

type GrokBotUnready = z.infer<typeof GrokBotUnreadySchema>;

type AiSave =
  | z.infer<typeof AiSaveResponseSchema>
  | { readonly kind: "grok-bot-unready"; readonly code: GrokBotUnready["code"] };

export async function saveAiSettings(input: Readonly<AiSettingsInput>): Promise<AiSave> {
  const response = await callOk("PUT", "/api/settings/ai", { json: input, tolerates: [400] });

  if (response.status !== 400) return parsedBody(response, AiSaveResponseSchema);

  const unready = GrokBotUnreadySchema.safeParse(await response.json());

  if (!unready.success) throw new Error("PUT /api/settings/ai answered 400");

  return { kind: "grok-bot-unready", code: unready.data.code };
}

export function verifyAi(): Promise<VerifyResult> {
  return parsedFrom("POST", "/api/settings/ai/verify", VerifyResultSchema);
}

type ConnectStart =
  | { readonly kind: "started"; readonly authorizationUrl: string }
  | { readonly kind: "stale" | "unavailable" | "failed" };

export async function startConnect(input: Readonly<ConnectStartInput>): Promise<ConnectStart> {
  const response = await call("POST", CONNECT_START_PATH, { json: input });

  if (response.status === 201)
    return {
      kind: "started",
      authorizationUrl: (await parsedBody(response, ConnectStartResponseSchema)).authorizationUrl,
    };

  if (response.status === 409) return { kind: "stale" };

  return { kind: response.status === 503 ? "unavailable" : "failed" };
}
