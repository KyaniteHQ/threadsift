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
  return parsedFrom("PUT", "/api/settings/ai", AiSaveResponseSchema, { json: input });
}

export function verifyAi(): Promise<VerifyResult> {
  return parsedFrom("POST", "/api/settings/ai/verify", VerifyResultSchema);
}
