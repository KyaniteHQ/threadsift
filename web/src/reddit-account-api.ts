import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditVerifySchema,
} from "../../src/core/reddit-account-contract.ts";
import { parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/reddit-account";

export function fetchRedditAccount(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, RedditAccountViewSchema, { signal });
}

export function saveRedditAccount(session: string) {
  return parsedFrom("PUT", ENDPOINT, RedditAccountSaveResponseSchema, { json: { session } });
}

export async function verifyRedditAccount() {
  return (await parsedFrom("POST", `${ENDPOINT}/verify`, RedditVerifySchema)).result;
}

export function removeRedditAccount() {
  return parsedFrom("DELETE", ENDPOINT, RedditAccountViewSchema);
}
