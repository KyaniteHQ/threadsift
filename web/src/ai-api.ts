import type { z } from "zod";

import {
  AiSettingsViewSchema,
  AiSaveResponseSchema,
  VerifyResultSchema,
  type AiSettingsInput,
} from "../../src/core/ai-contract.ts";
import { parsedFrom } from "./calls.ts";

export type AiView = z.infer<typeof AiSettingsViewSchema>;

export type VerifyResult = z.infer<typeof VerifyResultSchema>;

export function fetchAiSettings(): Promise<AiView> {
  return parsedFrom("GET", "/api/settings/ai", AiSettingsViewSchema);
}

export function saveAiSettings(input: Readonly<AiSettingsInput>) {
  const json =
    "baseUrl" in input
      ? { provider: input.provider, baseUrl: input.baseUrl, model: input.model }
      : { provider: input.provider, model: input.model };

  return parsedFrom("PUT", "/api/settings/ai", AiSaveResponseSchema, {
    json: input.key === undefined ? json : { ...json, key: input.key },
  });
}

export function verifyAi(): Promise<VerifyResult> {
  return parsedFrom("POST", "/api/settings/ai/verify", VerifyResultSchema);
}
