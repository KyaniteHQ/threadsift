import { eq, isNotNull, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { guardedBatch } from "./guards.ts";
import type { Ports } from "./ports.ts";
import {
  VAULT_DEADLINE_MS,
  type VaultInput,
  type VaultRefusal,
  type VaultView,
  type VaultVerifyInput,
} from "./vault-contract.ts";
import { VaultFailure, refusalReason } from "./vault-failure.ts";
import { vaultGithub } from "./vault-github.ts";
import { queueVaultLibrary } from "./vault-queue.ts";
import { VAULT_CLOCK, vaultFolderIdleAt, vaultIdleAt } from "./vault-state.ts";
import { mirrorFiles, mirrorNotes, vaultDestination, vaultSettings } from "./vault-tables.ts";

type VaultPorts = Pick<Ports, "db" | "secrets" | "vaultFolder">;

async function readTarget(db: Database) {
  const [row] = await db.select().from(vaultSettings);
  return row === undefined ? null : vaultDestination(row);
}

async function folderConflicts(db: Database) {
  const rows = await db
    .selectDistinct({ path: mirrorNotes.conflictPath })
    .from(mirrorNotes)
    .where(isNotNull(mirrorNotes.conflictPath))
    .orderBy(mirrorNotes.conflictPath);
  return rows.flatMap(({ path }) => (path === null ? [] : [path]));
}

export async function readVaultSettings({
  db,
  secrets,
  vaultFolder,
}: VaultPorts): Promise<VaultView> {
  const target = await readTarget(db);
  const secretReady = secrets !== null;
  const folderAvailable = vaultFolder !== null;
  if (target?.mode === "folder" && folderAvailable)
    return {
      mode: "folder",
      folderAvailable: true,
      folder: target.folder,
      conflicts: await folderConflicts(db),
      secretReady,
    };

  const github = target?.mode === "github" ? target : null;
  const opened = github === null ? null : await secrets?.open(github.sealedToken);
  return {
    mode: "github",
    folderAvailable,
    repository: github?.repository ?? "",
    branch: github?.branch ?? "main",
    secretReady,
    token:
      github === null ? "none" : opened === null || opened === undefined ? "unreadable" : "saved",
  };
}

function refused(reason: VaultRefusal["reason"]): VaultRefusal {
  return { kind: "refused", reason };
}

const folderIdle = vaultFolderIdleAt(VAULT_CLOCK);

async function settingRow({ secrets, vaultFolder }: VaultPorts, input: Readonly<VaultInput>) {
  if (input.mode === "folder") {
    if (vaultFolder === null) return refused("folder-unavailable");
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
  const changed = sql`exists (select 1 from ${vaultSettings}
    where ${vaultSettings.mode} <> ${row.mode}
      or ${vaultSettings.folder} is not ${row.folder}
      or ${vaultSettings.repository} is not ${row.repository}
      or ${vaultSettings.branch} is not ${row.branch})`;
  const saved = await guardedBatch(db, idle, [
    db.delete(mirrorFiles).where(changed),
    db.update(mirrorNotes).set({ conflictPath: null }).where(changed),
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
  ports: VaultPorts & Pick<Ports, "network">,
  input: Readonly<Exclude<VaultVerifyInput, { mode: "folder" }>>,
  signal: AbortSignal,
) {
  if (ports.secrets === null) return refused("secret-missing");
  const saved = await readTarget(ports.db);
  const stored =
    saved?.mode === "github" &&
    saved.repository === input.repository &&
    saved.branch === input.branch
      ? await ports.secrets.open(saved.sealedToken)
      : null;
  const token = input.token ?? stored;
  if (token === null) return refused("not-configured");
  await vaultGithub(ports.network, { ...input, token }, signal).verify();
  return { kind: "verified" } as const;
}

export async function verifyVaultSettings(
  ports: VaultPorts & Pick<Ports, "network">,
  input: Readonly<VaultVerifyInput>,
  signal: AbortSignal,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(VAULT_DEADLINE_MS)]);
  try {
    if (input.mode !== "folder") return await verifyGithub(ports, input, deadline);
    if (ports.vaultFolder === null) return refused("folder-unavailable");
    await ports.vaultFolder(input.folder, deadline).verify();
    return { kind: "verified" } as const;
  } catch (error) {
    if (!(error instanceof VaultFailure)) throw error;
    return refused(refusalReason(error.reason));
  }
}
