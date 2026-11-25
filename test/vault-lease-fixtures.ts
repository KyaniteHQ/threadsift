import assert from "node:assert/strict";

import { vaultSettings } from "../src/core/kernel/vault-tables.ts";
import {
  claimVaultLease,
  currentVaultLease,
  fenceVault,
} from "../src/features/vault/core/vault-state.ts";
import { instanceDatabase } from "./instance-database.ts";

const LEASE_MS = 60_000;

export async function heldFolderLease(folder: string) {
  using cleanup = new DisposableStack();
  const stored = cleanup.use(instanceDatabase());

  await stored.db
    .insert(vaultSettings)
    .values({ id: 1, mode: "folder", folder, generation: 0, leaseUntil: 0 });

  const lease = await claimVaultLease(stored.db, { started: Date.now(), deadlineMs: LEASE_MS });

  assert.ok(lease !== null, "the Folder lease is claimed");

  const held = cleanup.move();

  return {
    current: () => currentVaultLease(stored.db, lease),
    fence: async () => {
      await fenceVault(stored.db);
    },
    [Symbol.dispose]: () => {
      held.dispose();
    },
  };
}
