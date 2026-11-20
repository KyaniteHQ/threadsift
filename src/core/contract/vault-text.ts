import { byteSize } from "./format.ts";
import { GITHUB_FILE_BYTES } from "./vault-contract.ts";

export const VAULT_TEXT = {
  conflict: "Vault mirror blocked by a file Threadsift did not write",
  skipped: `Skipped by the Vault mirror because it exceeds GitHub's ${byteSize(GITHUB_FILE_BYTES)} limit`,
  topicHeading: "Topic",
  itemsHeading: "Items",
  disagreementsHeading: "Known disagreements",
  relatedHeading: "Related Items",
  indexHeading: "Index",
  logHeading: "Log",
} as const;
