import {
  RedditSettingsSchema,
  type RedditSettings,
} from "../../src/core/contract/reddit-contract.ts";
import { parsedBody, parsedFrom, put } from "./calls.ts";
import { RESTORING, type Restoring, callUnlessRestoring, isRestoring } from "./unavailable.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/reddit";

export function fetchRedditSettings(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditSettingsSchema, { signal });
}

export async function saveRedditSettings(
  input: Readonly<RedditSettings>,
): Promise<RedditSettings | Restoring> {
  const response = await callUnlessRestoring(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, {
    json: input,
  });

  return isRestoring(response) ? RESTORING : parsedBody(response, RedditSettingsSchema);
}
