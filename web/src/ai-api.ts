import type { z } from "zod";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
  type AiSettingsInput,
} from "../../src/core/ai-contract.ts";
import {
  CONNECT_START_PATH,
  ConnectStartResponseSchema,
  type ConnectStartInput,
} from "../../src/core/openrouter-contract.ts";
import { call, parsedBody, parsedFrom } from "./calls.ts";

export type AiView = z.infer<typeof AiSettingsViewSchema>;

type VerifyResult = z.infer<typeof VerifyResultSchema>;

export function fetchAiSettings(signal: AbortSignal): Promise<AiView> {
  return parsedFrom("GET", "/api/settings/ai", AiSettingsViewSchema, { signal });
}

export function saveAiSettings(input: Readonly<AiSettingsInput>) {
  return parsedFrom("PUT", "/api/settings/ai", AiSaveResponseSchema, { json: input });
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
