import { pause } from "../../../core/contract/pause.ts";
import { VAULT_DEADLINE_MS, VAULT_NOTE_LIMIT } from "../../../core/contract/vault-contract.ts";
import { bestEffort, logFailure, report } from "../../../core/kernel/failure-log.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { dueVaultNotes, type PendingVaultNote } from "../../../core/kernel/vault-queue.ts";
import { VaultFileConflict, type VaultTarget } from "../../../core/kernel/vault-target.ts";
import { VaultFailure, vaultFailure } from "./vault-failure.ts";
import { vaultFiles } from "./vault-files.ts";
import { vaultGithub } from "./vault-github.ts";
import {
  type VaultLease,
  acknowledgeVault,
  seedVaultInventory,
  currentVaultNotes,
  currentVaultLease,
  parkVaultConflict,
  claimVaultLease,
  finishVaultLease,
} from "./vault-state.ts";

const TOPIC_NOTE_LIMIT = 4;
const SHARED_NOTE_LIMIT = 4;
const FAILURE_WAIT_MS = 60_000;
const REBUILD_WAIT_MS = 1000;

interface Drain {
  readonly ports: JobPorts;
  readonly lease: Readonly<VaultLease>;
  readonly target: VaultTarget;
  readonly signal: AbortSignal;
}

async function publish(
  { ports, target, signal, lease }: Drain,
  pending: readonly PendingVaultNote[],
) {
  const batch = await vaultFiles({ ports, target, signal, pending });
  if (batch.pending.length === 0) return;
  const current = async () =>
    (await currentVaultNotes(ports.db, lease, batch.pending)).length === batch.pending.length;
  if (!(await current())) throw vaultFailure("stale");
  await target.write({
    files: batch.files,
    current,
  });
  await acknowledgeVault(ports.db, lease, batch);
}

async function publishCurrent(input: Drain, pending: readonly PendingVaultNote[]): Promise<void> {
  try {
    await publish(input, pending);
  } catch (error) {
    if (error instanceof VaultFileConflict) {
      await parkVaultConflict(input.ports.db, input.lease, error.file);
      const remaining = pending.filter(({ sequence }) => sequence !== error.file.sequence);
      if (remaining.length < pending.length) await publishCurrent(input, remaining);
      return;
    }
    if (!(error instanceof VaultFailure) || error.reason !== "stale") throw error;
    const remaining = await currentVaultNotes(input.ports.db, input.lease, pending);
    report("vault-write-stale", {
      generation: input.lease.generation,
      kind: pending[0]?.kind ?? "none",
      remaining: remaining.length,
    });
    if (remaining.length > 0 && remaining.length < pending.length)
      await publishCurrent(input, remaining);
  }
}

async function publishShared(input: Drain, pending: readonly PendingVaultNote[]): Promise<void> {
  const [note, ...remaining] = pending;
  if (note === undefined) return;
  await publishCurrent(input, [note]);
  await publishShared(input, remaining);
}

async function targetFor(ports: JobPorts, lease: Readonly<VaultLease>, signal: AbortSignal) {
  const { target } = lease;
  if (target.mode === "folder") {
    if (ports.vaultFolder === null) throw vaultFailure("folder-unavailable");
    return ports.vaultFolder(target.folder, signal);
  }
  const token = await ports.secrets?.open(target.sealedToken);
  if (token === null || token === undefined) throw vaultFailure("secret-missing");
  return vaultGithub(
    ports.network,
    { repository: target.repository, branch: target.branch, token },
    signal,
  );
}

async function drain(
  ports: JobPorts,
  lease: Readonly<VaultLease>,
  signal: AbortSignal,
): Promise<void> {
  const target = await targetFor(ports, lease, signal);
  if (lease.target.mode === "folder")
    await target.write({ files: [], current: () => currentVaultLease(ports.db, lease) });
  if (lease.scanPending || lease.wikiPending)
    await seedVaultInventory(ports.db, lease, await target.subjects());
  const input = { ports, lease, target, signal };
  const items = await dueVaultNotes(
    ports.db,
    VAULT_NOTE_LIMIT - TOPIC_NOTE_LIMIT - SHARED_NOTE_LIMIT,
    "item",
  );
  await publishCurrent(input, items);
  await publishCurrent(input, await dueVaultNotes(ports.db, TOPIC_NOTE_LIMIT, "topic"));
  await publishShared(input, await dueVaultNotes(ports.db, SHARED_NOTE_LIMIT, "shared"));
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
  return cause instanceof VaultFailure && cause.until !== null
    ? cause.until
    : Date.now() + FAILURE_WAIT_MS;
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
    await pause(REBUILD_WAIT_MS);
    await rebuildingDrain(ports, lease, signal, attempt + 1);
  }
}

export async function mirrorVault(ports: JobPorts): Promise<void> {
  const started = Date.now();
  const signal = AbortSignal.timeout(VAULT_DEADLINE_MS);
  const lease = await claimVaultLease(ports.db, { started, deadlineMs: VAULT_DEADLINE_MS });
  if (lease === null) return;
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
