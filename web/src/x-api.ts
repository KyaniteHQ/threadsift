import { XSettingsViewSchema } from "../../src/core/x-settings.ts";
import { parsedFrom } from "./calls.ts";

export function fetchXSettings(signal: AbortSignal) {
  return parsedFrom("GET", "/api/settings/x", XSettingsViewSchema, { signal });
}
