import {
  type GrokBotInput,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../../src/core/grok-bot-contract.ts";
import { callOk, parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/grok-bot";

export function fetchGrokBotSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, GrokBotViewSchema, { signal });
}

export function saveGrokBot(input: Readonly<GrokBotInput>) {
  return parsedFrom("PUT", ENDPOINT, GrokBotSaveResponseSchema, { json: input });
}

export async function removeGrokBot(): Promise<void> {
  await callOk("DELETE", ENDPOINT);
}

export async function testGrokBot() {
  return (await parsedFrom("POST", `${ENDPOINT}/test`, GrokBotTestSchema)).result;
}
