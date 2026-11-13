import {
  type GrokBotInput,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../../src/core/grok-bot-contract.ts";
import { parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/grok-bot";

export function fetchGrokBotSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, GrokBotViewSchema, { signal });
}

export function saveGrokBot(input: Readonly<GrokBotInput>) {
  return parsedFrom("PUT", ENDPOINT, GrokBotSaveResponseSchema, { json: input });
}

export function removeGrokBot() {
  return parsedFrom("DELETE", ENDPOINT, GrokBotViewSchema);
}

export async function testGrokBot() {
  return (await parsedFrom("POST", `${ENDPOINT}/test`, GrokBotTestSchema)).result;
}
