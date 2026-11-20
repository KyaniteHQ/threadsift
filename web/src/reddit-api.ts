import {
  RedditSettingsSchema,
  type RedditSettings,
} from "../../src/core/contract/reddit-contract.ts";
import { parsedFrom, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/reddit";

export function fetchRedditSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditSettingsSchema, { signal });
}

export function saveRedditSettings(input: Readonly<RedditSettings>) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, RedditSettingsSchema, {
    json: input,
  });
}
