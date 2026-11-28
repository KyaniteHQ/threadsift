import {
  RedditSettingsSchema,
  type RedditSettings,
} from "../../src/core/contract/reddit-contract.ts";
import { callOk, parsedBody, parsedFrom, put } from "./calls.ts";
import { isRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/reddit";

export function fetchRedditSettings(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditSettingsSchema, { signal });
}

export type RedditSave =
  | { readonly kind: "saved"; readonly settings: RedditSettings }
  | { readonly kind: "restoring" };

export async function saveRedditSettings(input: Readonly<RedditSettings>): Promise<RedditSave> {
  const response = await callOk(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, {
    json: input,
    tolerates: [503],
  });

  if (await isRestoring(response)) return { kind: "restoring" };

  return { kind: "saved", settings: await parsedBody(response, RedditSettingsSchema) };
}
