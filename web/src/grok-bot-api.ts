import {
  type GrokBotInput,
  GrokBotInUseSchema,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../../src/core/grok-bot-contract.ts";
import { callOk, parsedBody, parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/grok-bot";

export function fetchGrokBotSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, GrokBotViewSchema, { signal });
}

export function saveGrokBot(input: Readonly<GrokBotInput>) {
  return parsedFrom("PUT", ENDPOINT, GrokBotSaveResponseSchema, { json: input });
}

export async function removeGrokBot() {
  const response = await callOk("DELETE", ENDPOINT, { tolerates: [409] });

  if (response.status === 409) {
    await parsedBody(response, GrokBotInUseSchema);

    return { kind: "in-use" } as const;
  }

  return { kind: "removed", view: await parsedBody(response, GrokBotViewSchema) } as const;
}

export async function testGrokBot() {
  return (await parsedFrom("POST", `${ENDPOINT}/test`, GrokBotTestSchema)).result;
}
