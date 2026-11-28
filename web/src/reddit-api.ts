import {
  RedditSettingsSchema,
  type RedditSettings,
} from "../../src/core/contract/reddit-contract.ts";
import { parsedFrom } from "./calls.ts";
import { savedSetting } from "./setting-save.ts";

const ENDPOINT = "/api/settings/reddit";

export function fetchRedditSettings(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditSettingsSchema, { signal });
}

export function saveRedditSettings(input: Readonly<RedditSettings>) {
  return savedSetting(ENDPOINT, RedditSettingsSchema, input);
}
