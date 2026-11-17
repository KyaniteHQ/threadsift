import { eq, sql } from "drizzle-orm";

import type { Ports } from "./ports.ts";
import {
  VAULT_DEADLINE_MS,
  type VaultInput,
  type VaultView,
  type VaultVerifyInput,
} from "./vault-contract.ts";
import { vaultGithub } from "./vault-github.ts";
import { VaultFailure } from "./vault-request.ts";
import { mirrorFiles, mirrorNotes, vaultSettings } from "./vault-tables.ts";

type VaultPorts = Pick<Ports, "db" | "secrets">;

export async function readVaultSettings({ db, secrets }: VaultPorts): Promise<VaultView> {
  const [row] = await db.select().from(vaultSettings);
  const opened = row === undefined || secrets === null ? null : await secrets.open(row.sealedToken);
  return {
    repository: row?.repository ?? "",
    branch: row?.branch ?? "main",
    secretReady: secrets !== null,
    token: row === undefined ? "none" : opened === null ? "unreadable" : "saved",
  };
}

export async function saveVaultSettings(ports: VaultPorts, input: Readonly<VaultInput>) {
  const { db, secrets } = ports;
  if (secrets === null) return { kind: "refused", reason: "secret-missing" } as const;
  const row = {
    id: 1,
    repository: input.repository,
    branch: input.branch,
    sealedToken: await secrets.seal(input.token),
  };
  await db.batch([
    db
      .delete(mirrorFiles)
      .where(
        sql`exists (select 1 from ${vaultSettings} where ${vaultSettings.repository} <> ${input.repository} or ${vaultSettings.branch} <> ${input.branch})`,
      ),
    db
      .insert(vaultSettings)
      .values(row)
      .onConflictDoUpdate({
        target: vaultSettings.id,
        set: {
          ...row,
          generation: sql`${vaultSettings.generation} + 1`,
          leaseUntil: 0,
          nextAttemptAt: 0,
          rateFailures: 0,
          scanPending: true,
        },
      }),
  ]);
  return readVaultSettings(ports);
}

export async function removeVaultSettings(ports: VaultPorts): Promise<VaultView> {
  await ports.db.batch([
    ports.db.delete(vaultSettings).where(eq(vaultSettings.id, 1)),
    ports.db.delete(mirrorNotes),
    ports.db.delete(mirrorFiles),
  ]);
  return readVaultSettings(ports);
}

export async function verifyVaultSettings(
  ports: Pick<Ports, "db" | "network" | "secrets">,
  input: Readonly<VaultVerifyInput>,
  signal: AbortSignal,
) {
  if (ports.secrets === null) return { kind: "refused", reason: "secret-missing" } as const;
  const [saved] = await ports.db.select().from(vaultSettings);
  const stored =
    saved !== undefined && saved.repository === input.repository && saved.branch === input.branch
      ? await ports.secrets.open(saved.sealedToken)
      : null;
  const token = input.token ?? stored;
  if (token === null) return { kind: "refused", reason: "not-configured" } as const;
  try {
    await vaultGithub(
      ports.network,
      { ...input, token },
      AbortSignal.any([signal, AbortSignal.timeout(VAULT_DEADLINE_MS)]),
    ).verify();
    return { kind: "verified" } as const;
  } catch (error) {
    if (error instanceof VaultFailure)
      return {
        kind: "refused",
        reason:
          error.reason === "stale" ||
          error.reason === "invalid-response" ||
          error.reason === "branch-moved"
            ? "github-error"
            : error.reason,
      } as const;
    throw error;
  }
}
