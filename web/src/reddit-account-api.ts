import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditVerifySchema,
} from "../../src/core/contract/reddit-account-contract.ts";
import { del, parsedFrom, post } from "./calls.ts";
import { savedSetting } from "./setting-save.ts";
import { DATABASE_WRITE_DEADLINE_MS, REDDIT_VERIFY_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/reddit-account";

export function fetchRedditAccount(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditAccountViewSchema, { signal });
}

export function saveRedditAccount(session: string) {
  return savedSetting(ENDPOINT, RedditAccountSaveResponseSchema, { session });
}

export async function verifyRedditAccount() {
  return (
    await parsedFrom(post(REDDIT_VERIFY_DEADLINE_MS), `${ENDPOINT}/verify`, RedditVerifySchema)
  ).result;
}

export function removeRedditAccount() {
  return parsedFrom(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, RedditAccountViewSchema);
}
