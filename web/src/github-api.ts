import {
  GithubSaveResponseSchema,
  GithubSettingsViewSchema,
  GithubVerifyResultSchema,
  type GithubTokenInput,
} from "../../src/core/contract/github-contract.ts";
import { del, parsedFrom, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS, HOP_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/github";

export function fetchGithubSettings(signal: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, GithubSettingsViewSchema, { signal });
}

export function saveGithubToken(input: Readonly<GithubTokenInput>) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, GithubSaveResponseSchema, {
    json: input,
  });
}

export function removeGithubToken() {
  return parsedFrom(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, GithubSettingsViewSchema);
}

export function verifyGithubToken() {
  return parsedFrom(post(HOP_WRITE_DEADLINE_MS), `${ENDPOINT}/verify`, GithubVerifyResultSchema);
}
