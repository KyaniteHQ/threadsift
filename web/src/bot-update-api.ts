import { BotUpdateViewSchema } from "../../src/core/contract/bot-install-contract.ts";
import { parsedFrom } from "./calls.ts";
import { savedSetting } from "./setting-save.ts";

const ENDPOINT = "/api/settings/bot-update";

export function fetchBotUpdate(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, BotUpdateViewSchema, { signal });
}

export function saveBotUpdate(autoInstall: boolean) {
  return savedSetting(ENDPOINT, BotUpdateViewSchema, { autoInstall });
}
