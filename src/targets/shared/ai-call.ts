import { refusedAi } from "../../core/ai-contract.ts";

export const AI_CALL_OPTIONS = {
  maxOutputTokens: 2048,
  maxRetries: 0,
  telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
} as const;

export function apiRefusal(status: number | undefined) {
  if (status === undefined) return refusedAi("unreachable");

  switch (status) {
    case 401:
    case 403:
      return refusedAi("wrong-key", status);
    case 400:
    case 422:
      return refusedAi("no-json", status);
    case 404:
      return refusedAi("model-not-found", status);
    default:
      return status === 429 || status >= 500
        ? refusedAi("provider-busy", status)
        : refusedAi("unreachable", status);
  }
}
