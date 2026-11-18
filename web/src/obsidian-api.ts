import {
  VaultResultSchema,
  VaultViewSchema,
  VAULT_DEADLINE_MS,
  type VaultInput,
  type VaultVerifyInput,
} from "../../src/core/vault-contract.ts";
import { del, parsedFrom, post, put } from "./calls.ts";
import { DATABASE_WRITE_DEADLINE_MS } from "./write-deadlines.ts";

const ENDPOINT = "/api/settings/obsidian";

export function fetchObsidian(signal?: AbortSignal) {
  return parsedFrom("GET", ENDPOINT, VaultViewSchema, { signal });
}

export function saveObsidian(input: Readonly<VaultInput>) {
  return parsedFrom(put(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, VaultResultSchema, {
    json: input,
  });
}

export function verifyObsidian(input: Readonly<VaultVerifyInput>) {
  return parsedFrom(post(VAULT_DEADLINE_MS), `${ENDPOINT}/verify`, VaultResultSchema, {
    json: input,
    signsOut: false,
  });
}

export function removeObsidian() {
  return parsedFrom(del(DATABASE_WRITE_DEADLINE_MS), ENDPOINT, VaultResultSchema);
}
