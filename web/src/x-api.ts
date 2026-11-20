import {
  type XReaderChoice,
  XSettingsViewSchema,
} from "../../src/core/contract/x-settings-contract.ts";
import { parsedFrom, put } from "./calls.ts";
import { PROBED_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/x";

export function fetchXSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, XSettingsViewSchema, { signal });
}

export function saveXReader(reader: XReaderChoice) {
  return parsedFrom(put(PROBED_WRITE_DEADLINE_MS), ENDPOINT, XSettingsViewSchema, {
    json: { reader },
  });
}
