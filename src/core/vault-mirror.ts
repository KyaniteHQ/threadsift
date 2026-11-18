import { bestEffort, logFailure, report } from "./failure-log.ts";
import type { JobPorts } from "./job-outcome.ts";
import { VAULT_DEADLINE_MS, VAULT_NOTE_LIMIT } from "./vault-contract.ts";
import { vaultFiles } from "./vault-files.ts";
import { vaultGithub } from "./vault-github.ts";
import { dueVaultNotes } from "./vault-queue.ts";
import { VaultFailure, staleVault } from "./vault-request.ts";
import {
  type VaultLease,
  acknowledgeVault,
  seedVaultInventory,
  vaultCurrent,
  claimVaultLease,
  finishVaultLease,
} from "./vault-state.ts";

async function drain(
  ports: JobPorts,
  lease: Readonly<VaultLease>,
  signal: AbortSignal,
): Promise<void> {
  const token = await ports.secrets?.open(lease.sealedToken);
  if (token === null || token === undefined)
    throw new VaultFailure({ reason: "secret-missing", until: null, status: null });
  const github = vaultGithub(ports.network, { ...lease, token }, signal);
  if (lease.scanPending || lease.wikiPending)
    await seedVaultInventory(ports.db, lease, await github.subjects());
  const pending = await dueVaultNotes(ports.db, VAULT_NOTE_LIMIT);
  if (pending.length === 0) return;
  const batch = await vaultFiles({ ports, github, signal, pending });
  if (!(await vaultCurrent(ports.db, lease, batch.pending))) throw staleVault();
  await github.write({
    files: batch.files,
    current: () => vaultCurrent(ports.db, lease, batch.pending),
  });
  await acknowledgeVault(ports.db, {
    lease,
    pending: batch.complete,
    files: batch.progress,
    oversized: batch.oversized,
  });
}

function failureWait(lease: Readonly<VaultLease>, cause: unknown): number | null {
  if (
    cause instanceof VaultFailure &&
    (cause.reason === "stale" || cause.reason === "branch-moved")
  ) {
    report("vault-write-stale", { generation: lease.generation });
    return null;
  }
  const fields =
    cause instanceof VaultFailure
      ? { generation: lease.generation, reason: cause.reason, status: cause.status ?? "none" }
      : { generation: lease.generation };
  logFailure("vault-mirror-failed", fields, cause);
  return cause instanceof VaultFailure && cause.until !== null ? cause.until : Date.now() + 60_000;
}

async function rebuildingDrain(
  ports: JobPorts,
  lease: Readonly<VaultLease>,
  signal: AbortSignal,
  attempt: number,
): Promise<void> {
  try {
    await drain(ports, lease, signal);
  } catch (error) {
    if (!(error instanceof VaultFailure) || error.reason !== "branch-moved" || attempt >= 2)
      throw error;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1000);
    });
    await rebuildingDrain(ports, lease, signal, attempt + 1);
  }
}

export async function mirrorVault(ports: JobPorts): Promise<void> {
  const started = Date.now();
  const signal = AbortSignal.timeout(VAULT_DEADLINE_MS);
  const [lease] = await claimVaultLease(ports.db, { started, deadlineMs: VAULT_DEADLINE_MS });
  if (lease === undefined) return;
  let until: number | null = null;
  let limited = false;
  try {
    await rebuildingDrain(ports, lease, signal, 0);
  } catch (error) {
    until = failureWait(lease, error);
    limited = error instanceof VaultFailure && error.reason === "rate-limited";
  } finally {
    await bestEffort(
      { event: "vault-lease-not-released", fields: { generation: lease.generation } },
      async () => {
        await finishVaultLease(ports.db, lease, { until, limited });
      },
    );
  }
}
