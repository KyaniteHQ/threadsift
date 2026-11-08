import {
  GithubSaveResponseSchema,
  GithubSettingsViewSchema,
  GithubVerifyResultSchema,
  type GithubTokenInput,
} from "../../src/core/github-contract.ts";
import { parsedFrom } from "./calls.ts";

const ENDPOINT = "/api/settings/github";

export function fetchGithubSettings() {
  return parsedFrom("GET", ENDPOINT, GithubSettingsViewSchema);
}

export function saveGithubToken(input: Readonly<GithubTokenInput>) {
  return parsedFrom("PUT", ENDPOINT, GithubSaveResponseSchema, { json: input });
}

export function removeGithubToken() {
  return parsedFrom("DELETE", ENDPOINT, GithubSettingsViewSchema);
}

export function verifyGithubToken() {
  return parsedFrom("POST", `${ENDPOINT}/verify`, GithubVerifyResultSchema);
}
