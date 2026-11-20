import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditVerifySchema,
} from "../../src/core/contract/reddit-account-contract.ts";
import { del, parsedFrom, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS, REDDIT_VERIFY_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/reddit-account";

export function fetchRedditAccount(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditAccountViewSchema, { signal });
}

export function saveRedditAccount(session: string) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, RedditAccountSaveResponseSchema, {
    json: { session },
  });
}

export async function verifyRedditAccount() {
  return (
    await parsedFrom(post(REDDIT_VERIFY_DEADLINE_MS), `${ENDPOINT}/verify`, RedditVerifySchema)
  ).result;
}

export function removeRedditAccount() {
  return parsedFrom(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, RedditAccountViewSchema);
}
