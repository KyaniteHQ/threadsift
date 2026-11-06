import { z } from "zod";

import {
  AiSettingsViewSchema,
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
  const json = { provider: input.provider, baseUrl: input.baseUrl, model: input.model };

  return parsedFrom(
    "PUT",
    "/api/settings/ai",
    z.union([AiSettingsViewSchema, VerifyResultSchema]),
    { json: input.key === undefined ? json : { ...json, key: input.key } },
  );
}

export function verifyAi(): Promise<VerifyResult> {
  return parsedFrom("POST", "/api/settings/ai/verify", VerifyResultSchema);
}
