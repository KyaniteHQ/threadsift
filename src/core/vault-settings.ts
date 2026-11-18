import { eq, sql } from "drizzle-orm";

import { guardedBatch } from "./guards.ts";
import type { Ports } from "./ports.ts";
import {
  VAULT_DEADLINE_MS,
  type VaultInput,
  type VaultRefusal,
  type VaultView,
  type VaultVerifyInput,
} from "./vault-contract.ts";
import { queueVaultLibrary } from "./vault-queue.ts";
import { VaultFailure } from "./vault-request.ts";
import { VAULT_CLOCK, vaultIdleAt } from "./vault-state.ts";
import { mirrorFiles, mirrorNotes, vaultSettings } from "./vault-tables.ts";

type VaultPorts = Pick<Ports, "db" | "secrets" | "vaultTargets">;

export async function readVaultSettings({
  db,
  secrets,
  vaultTargets,
}: VaultPorts): Promise<VaultView> {
  const [row] = await db.select().from(vaultSettings);
  const secretReady = secrets !== null;
  if (row?.mode === "folder" && row.folder !== null && vaultTargets.folder !== null)
    return { mode: "folder", folderAvailable: true, folder: row.folder, secretReady };

  const token = row?.sealedToken;
  const opened = token === null || token === undefined ? null : await secrets?.open(token);
  return {
    mode: "github",
    folderAvailable: vaultTargets.folder !== null,
    repository: row?.repository ?? "",
    branch: row?.branch ?? "main",
    secretReady,
    token:
      token === null || token === undefined
        ? "none"
        : opened === null || opened === undefined
          ? "unreadable"
          : "saved",
  };
}

function refused(reason: VaultRefusal["reason"]): VaultRefusal {
  return { kind: "refused", reason };
}

const folderIdle = sql`not exists (select 1 from ${vaultSettings}
  where ${vaultSettings.mode} = 'folder' and ${vaultSettings.leaseUntil} > ${VAULT_CLOCK})`;

async function settingRow({ secrets, vaultTargets }: VaultPorts, input: Readonly<VaultInput>) {
  if (input.mode === "folder") {
    if (vaultTargets.folder === null) return refused("folder-unavailable");
    return {
      mode: input.mode,
      folder: input.folder,
      repository: null,
      branch: null,
      sealedToken: null,
    };
  }
  if (secrets === null) return refused("secret-missing");
  return {
    mode: "github" as const,
    folder: null,
    repository: input.repository,
    branch: input.branch,
    sealedToken: await secrets.seal(input.token),
  };
}

export async function saveVaultSettings(ports: VaultPorts, input: Readonly<VaultInput>) {
  const { db } = ports;
  const target = await settingRow(ports, input);
  if ("kind" in target) return target;
  const row = { ...target, id: 1, wikiPending: false };
  const idle = target.mode === "folder" ? vaultIdleAt(VAULT_CLOCK) : folderIdle;
  const saved = await guardedBatch(db, idle, [
    db.delete(mirrorFiles).where(
      sql`exists (select 1 from ${vaultSettings}
          where ${vaultSettings.mode} <> ${row.mode}
            or ${vaultSettings.folder} is not ${row.folder}
            or ${vaultSettings.repository} is not ${row.repository}
            or ${vaultSettings.branch} is not ${row.branch})`,
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
    ...queueVaultLibrary(db),
  ]);
  return saved ? readVaultSettings(ports) : refused("vault-busy");
}

export async function removeVaultSettings(ports: VaultPorts) {
  const removed = await guardedBatch(ports.db, folderIdle, [
    ports.db.delete(vaultSettings).where(eq(vaultSettings.id, 1)),
    ports.db.delete(mirrorNotes),
    ports.db.delete(mirrorFiles),
  ]);
  return removed ? readVaultSettings(ports) : refused("vault-busy");
}

async function verifyGithub(
  ports: VaultPorts,
  input: Readonly<Exclude<VaultVerifyInput, { mode: "folder" }>>,
  signal: AbortSignal,
) {
  if (ports.secrets === null) return refused("secret-missing");
  const [saved] = await ports.db.select().from(vaultSettings);
  const stored =
    saved !== undefined &&
    saved.sealedToken !== null &&
    saved.repository === input.repository &&
    saved.branch === input.branch
      ? await ports.secrets.open(saved.sealedToken)
      : null;
  const token = input.token ?? stored;
  if (token === null) return refused("not-configured");
  await ports.vaultTargets.github({ ...input, token }, signal).verify();
  return { kind: "verified" } as const;
}

export async function verifyVaultSettings(
  ports: VaultPorts,
  input: Readonly<VaultVerifyInput>,
  signal: AbortSignal,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(VAULT_DEADLINE_MS)]);
  try {
    if (input.mode !== "folder") return await verifyGithub(ports, input, deadline);
    if (ports.vaultTargets.folder === null) return refused("folder-unavailable");
    await ports.vaultTargets.folder(input.folder, deadline).verify();
    return { kind: "verified" } as const;
  } catch (error) {
    if (!(error instanceof VaultFailure)) throw error;
    return refused(
      error.reason === "stale" ||
        error.reason === "invalid-response" ||
        error.reason === "branch-moved"
        ? "github-error"
        : error.reason,
    );
  }
}
