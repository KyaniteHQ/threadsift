import {
  type GrokBotInput,
  GrokBotInUseSchema,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../../src/core/contract/grok-bot-contract.ts";
import { callOk, del, parsedBody, parsedFrom, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS, HOP_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/grok-bot";

export function fetchGrokBotSettings(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, GrokBotViewSchema, { signal });
}

export function saveGrokBot(input: Readonly<GrokBotInput>) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, GrokBotSaveResponseSchema, {
    json: input,
  });
}

export async function removeGrokBot() {
  const response = await callOk(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, { tolerates: [409] });

  if (response.status === 409) {
    await parsedBody(response, GrokBotInUseSchema);

    return { kind: "in-use" } as const;
  }

  return { kind: "removed", view: await parsedBody(response, GrokBotViewSchema) } as const;
}

export async function testGrokBot() {
  return (await parsedFrom(post(HOP_WRITE_DEADLINE_MS), `${ENDPOINT}/test`, GrokBotTestSchema))
    .result;
}
