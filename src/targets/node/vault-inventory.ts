import { constants, fstatSync, openSync, readFileSync, readdirSync } from "node:fs";

import { VAULT_FILE_BYTES } from "../../core/contract/vault-contract.ts";
import type { VaultSubject } from "../../core/kernel/vault-tables.ts";
import { gitBlobSha } from "../../core/kernel/vault-target.ts";
import { type VaultEntries, type VaultEntry, vaultFileName } from "../../core/vault/vault-paths.ts";
import {
  type VaultDirectory,
  closeVaultFd,
  inMirrorFolder,
  inVaultDirectory,
} from "./vault-directory.ts";
import { receiptFolder } from "./vault-folders.ts";
import { pendingName, writtenAt } from "./vault-staging.ts";

const REGULAR_READ = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

interface Inventory {
  readonly subject?: VaultSubject;
  readonly published?: true;
}

interface Candidate {
  readonly path: string;
  readonly type: string;
  readonly hashed: string | null;
}

function blobBytes(path: string): Uint8Array | null {
  const fd = openSync(path, REGULAR_READ);
  try {
    const stat = fstatSync(fd);
    return !stat.isFile() || stat.size > VAULT_FILE_BYTES ? null : readFileSync(fd);
  } finally {
    closeVaultFd(fd);
  }
}

function fileSha(path: string): Promise<string> {
  const bytes = blobBytes(path);
  return bytes === null ? Promise.resolve("") : gitBlobSha(bytes);
}

async function shaEach(candidates: readonly Candidate[]): Promise<readonly VaultEntry[]> {
  const shas = new Map<string, string>();
  await candidates.reduce(async (previous, { path, hashed }) => {
    await previous;
    if (hashed !== null) shas.set(path, await fileSha(hashed));
  }, Promise.resolve());
  return candidates.map(({ path, type }) => ({ path, type, sha: shas.get(path) ?? "" }));
}

function filesIn(
  receipts: VaultDirectory,
  destination: VaultDirectory | undefined,
  inventory: Inventory,
) {
  const paths = new Map<string, Candidate>();
  for (const entry of readdirSync(receipts.path, { withFileTypes: true })) {
    const path = pendingName(entry.name);
    if (entry.isDirectory()) paths.set(path, { path, type: "tree", hashed: null });
    if (
      !entry.isFile() ||
      (inventory.subject !== undefined && !vaultFileName(inventory.subject, path))
    )
      continue;
    const receipt = `${receipts.path}/${entry.name}`;
    const published =
      destination !== undefined && writtenAt(`${destination.path}/${path}`, receipt);
    if (!published && (inventory.published === true || paths.has(path))) continue;
    paths.set(path, {
      path,
      type: "blob",
      hashed: published && inventory.subject !== undefined ? receipt : null,
    });
  }
  return shaEach([...paths.values()]);
}

export function folderEntries(root: VaultDirectory, inventory: Inventory): VaultEntries {
  return {
    at: async ([, ...parts]) =>
      (await inVaultDirectory(
        root,
        receiptFolder(parts),
        false,
        async (receipts) =>
          (await inMirrorFolder(root, parts, (directory) =>
            filesIn(receipts, directory, inventory),
          )) ?? filesIn(receipts, undefined, inventory),
      )) ?? [],
  };
}
