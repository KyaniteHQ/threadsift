import { byteSize } from "./format.ts";
import { GITHUB_FILE_BYTES } from "./vault-contract.ts";

export const VAULT_TEXT = {
  conflict: "Vault mirror waiting: move or remove the file Threadsift didn’t write",
  skipped: `Vault mirror skipped: file over GitHub’s ${byteSize(GITHUB_FILE_BYTES)} limit`,
  topicHeading: "Topic",
  itemsHeading: "Items",
  disagreementsHeading: "Known disagreements",
  relatedHeading: "Related items",
  indexHeading: "Index",
  logHeading: "Log",
} as const;
