import { VAULT_ROOT, WIKI_FOLDERS } from "../../core/vault-paths.ts";

export const WRITTEN = ".written";
const STAGING = ".staging";
const RECOVERED = ".recovered";

const RECEIPTS = [VAULT_ROOT, WRITTEN] as const;
export const STAGING_DIRECTORY = [...RECEIPTS, STAGING] as const;
export const RECOVERED_DIRECTORY = [...RECEIPTS, RECOVERED] as const;

export const MANAGED_FOLDERS: readonly (readonly string[])[] = [
  ...WIKI_FOLDERS.map((folder) => [folder]),
  [WRITTEN],
  [WRITTEN, STAGING],
  [WRITTEN, RECOVERED],
  ...WIKI_FOLDERS.map((folder) => [WRITTEN, folder]),
];

export function mirrorFolder(parts: readonly string[]): readonly string[] {
  return [VAULT_ROOT, ...parts];
}

export function receiptFolder(parts: readonly string[]): readonly string[] {
  return [...RECEIPTS, ...parts];
}
