import { vaultSettings } from "../src/core/kernel/vault-tables.ts";
import {
  type VaultLease,
  currentVaultLease,
  fenceVault,
} from "../src/features/vault/core/vault-state.ts";
import { instanceDatabase } from "./instance-database.ts";

const LEASE_MS = 60_000;

export async function heldFolderLease(folder: string) {
  const stored = instanceDatabase();

  await stored.db.insert(vaultSettings).values({
    id: 1,
    mode: "folder",
    folder,
    generation: 1,
    leaseUntil: Date.now() + LEASE_MS,
  });

  const lease: VaultLease = {
    target: { mode: "folder", folder },
    generation: 1,
    scanPending: false,
    wikiPending: false,
    rateFailures: 0,
  };

  return {
    current: () => currentVaultLease(stored.db, lease),
    fence: async () => {
      await fenceVault(stored.db);
    },
    [Symbol.dispose]: () => {
      stored[Symbol.dispose]();
    },
  };
}
