import type { XReaderChoice } from "../../src/core/kinds.ts";
import { XSettingsViewSchema } from "../../src/core/x-settings.ts";
import { parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/x";

export function fetchXSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, XSettingsViewSchema, { signal });
}

export function saveXReader(reader: XReaderChoice) {
  return parsedFrom("PUT", ENDPOINT, XSettingsViewSchema, { json: { reader } });
}
