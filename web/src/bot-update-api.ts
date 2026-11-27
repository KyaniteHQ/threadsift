import { BotUpdateViewSchema } from "../../src/core/contract/bot-install-contract.ts";
import { parsedFrom, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/bot-update";

export function fetchBotUpdate(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, BotUpdateViewSchema, { signal });
}

export function saveBotUpdate(autoInstall: boolean) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, BotUpdateViewSchema, {
    json: { autoInstall },
  });
}
