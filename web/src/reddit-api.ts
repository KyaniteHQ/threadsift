import { RedditSettingsSchema, type RedditSettings } from "../../src/core/reddit-contract.ts";
import { parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/reddit";

export function fetchRedditSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditSettingsSchema, { signal });
}

export function saveRedditSettings(input: Readonly<RedditSettings>) {
  return parsedFrom("PUT", ENDPOINT, RedditSettingsSchema, { json: input });
}
