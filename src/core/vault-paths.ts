import type { VaultSubject } from "./vault-tables.ts";

export const VAULT_ROOT = "Threadsift";

export function vaultNotePath({ kind, subjectId }: VaultSubject): string {
  const id = String(subjectId);

  switch (kind) {
    case "item":
      return `${VAULT_ROOT}/items/${id}/note-${id}.md`;
    case "topic":
      return `${VAULT_ROOT}/topics/topic-${id}.md`;
    case "index":
      return `${VAULT_ROOT}/Index.md`;
    case "log":
      return `${VAULT_ROOT}/Log.md`;
    default:
      return kind satisfies never;
  }
}
