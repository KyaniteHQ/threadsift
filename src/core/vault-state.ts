import { type SQLWrapper, and, eq, gt, lte, sql } from "drizzle-orm";

import type { Database } from "./database.ts";
import { backoffUntil } from "./github-rate-limit.ts";
import { among, guardHolds, guardedBatch } from "./guards.ts";
import { loggedVaultFile } from "./log-writes.ts";
import { HOLDS_LIBRARY } from "./restore-state.ts";
import { restoreRuns } from "./schema.ts";
import {
  type PendingVaultNote,
  parkedUntil,
  queueVaultLibrary,
  queueVaultLog,
  queueVaultNotes,
} from "./vault-queue.ts";
import {
  mirrorFiles,
  mirrorNotes,
  vaultSettings,
  vaultDestination,
  type VaultDestination,
  type VaultKind,
  type VaultSubject,
} from "./vault-tables.ts";
import type { VaultChange, VaultProgress } from "./vault-target.ts";

export type VaultLease = Readonly<{
  target: Readonly<VaultDestination>;
  generation: number;
  scanPending: boolean;
  wikiPending: boolean;
  rateFailures: number;
}>;
const REPEATED_LIMIT_DOUBLINGS = 5;

export const VAULT_CLOCK = sql`cast(unixepoch('subsec') * 1000 as integer)`;
export const VAULT_AVAILABLE = sql`not exists (select 1 from ${restoreRuns} where ${HOLDS_LIBRARY})`;

function leaseLiveAt(at: number | Readonly<SQLWrapper>) {
  return sql`${vaultSettings.leaseUntil} > ${at}`;
}

export function vaultIdleAt(at: number | Readonly<SQLWrapper>) {
  return sql<number>`not exists (select 1 from ${vaultSettings} where ${leaseLiveAt(at)})`;
}

export function vaultFolderIdleAt(at: number | Readonly<SQLWrapper>) {
  return sql<number>`not exists (select 1 from ${vaultSettings} where ${vaultSettings.mode} = 'folder' and ${leaseLiveAt(at)})`;
}

export function fenceVault(db: Database) {
  return db
    .update(vaultSettings)
    .set({ generation: sql`${vaultSettings.generation} + 1`, leaseUntil: 0 })
    .where(sql`changes() > 0`);
}

function sameVaultTarget({ target }: VaultLease) {
  return target.mode === "folder"
    ? sql`${vaultSettings.mode} = 'folder' and ${vaultSettings.folder} = ${target.folder}`
    : sql`${vaultSettings.mode} = 'github' and ${vaultSettings.sealedToken} = ${target.sealedToken}`;
}

export function vaultHolding(lease: Readonly<VaultLease>) {
  return and(
    eq(vaultSettings.generation, lease.generation),
    sameVaultTarget(lease),
    gt(vaultSettings.leaseUntil, VAULT_CLOCK),
  );
}

function activeVault(lease: VaultLease) {
  return sql`exists (select 1 from ${vaultSettings} where ${vaultHolding(lease)}) and ${VAULT_AVAILABLE}`;
}

export function currentVaultLease(db: Database, lease: VaultLease): Promise<boolean> {
  return guardHolds(db, activeVault(lease));
}

export async function parkVaultConflict(
  db: Database,
  lease: VaultLease,
  { path, sequence }: Readonly<VaultChange>,
): Promise<void> {
  const held = activeVault(lease);
  const note = eq(mirrorNotes.sequence, sequence);
  await db.batch([
    db
      .update(mirrorNotes)
      .set({ retryAt: parkedUntil(), conflictPath: path })
      .where(and(note, held)),
    ...loggedVaultFile(
      db,
      "vault-file-conflict",
      path,
      sql`${held} and exists (
      select 1 from ${mirrorNotes} where ${note}
    )`,
    ),
  ]);
}

export async function currentVaultNotes(
  db: Database,
  lease: Readonly<VaultLease>,
  pending: readonly PendingVaultNote[],
): Promise<readonly PendingVaultNote[]> {
  const rows = await db
    .select({ sequence: mirrorNotes.sequence })
    .from(mirrorNotes)
    .where(
      and(
        activeVault(lease),
        among(
          mirrorNotes.sequence,
          pending.map(({ sequence }) => sequence),
        ),
      ),
    );
  const sequences = new Set(rows.map(({ sequence }) => sequence));
  return pending.filter(({ sequence }) => sequences.has(sequence));
}

export async function seedVaultInventory(
  db: Database,
  lease: Readonly<VaultLease>,
  subjects: readonly VaultSubject[],
): Promise<void> {
  await guardedBatch(db, activeVault(lease), [
    ...(lease.wikiPending ? queueVaultLibrary(db) : []),
    queueVaultNotes(db, {
      kind: sql`json_extract(remote.value, '$.kind')`,
      id: sql`json_extract(remote.value, '$.subjectId')`,
      from: sql`json_each(${JSON.stringify(subjects)}) as remote`,
      when: sql`not exists (select 1 from ${mirrorNotes} where ${mirrorNotes.kind} = json_extract(remote.value, '$.kind') and ${mirrorNotes.subjectId} = json_extract(remote.value, '$.subjectId'))`,
    }),
    db
      .update(vaultSettings)
      .set({ scanPending: false, wikiPending: false })
      .where(vaultHolding(lease)),
  ]);
}

function fileWrites(
  db: Database,
  sameSettings: Readonly<SQLWrapper>,
  files: readonly VaultProgress[],
) {
  return files.map((file) =>
    file.sha === null
      ? db
          .delete(mirrorFiles)
          .where(
            and(
              eq(mirrorFiles.path, file.path),
              lte(mirrorFiles.sequence, file.sequence),
              sameSettings,
            ),
          )
      : db
          .insert(mirrorFiles)
          .select(
            db
              .select({
                path: sql<string>`${file.path}`.as("path"),
                kind: sql<VaultKind>`${file.noteKind}`.as("kind"),
                subjectId: sql<number>`${file.subjectId}`.as("subject_id"),
                sequence: sql<number>`${file.sequence}`.as("sequence"),
                sha: sql<string>`${file.sha}`.as("sha"),
              })
              .from(sql`(select 1)`)
              .where(sql`${sameSettings}`),
          )
          .onConflictDoUpdate({
            target: mirrorFiles.path,
            set: { sequence: sql`excluded.sequence`, sha: sql`excluded.sha` },
            setWhere: sql`${mirrorFiles.sequence} <= excluded.sequence`,
          }),
  );
}

export async function acknowledgeVault(
  db: Database,
  input: Readonly<{
    lease: VaultLease;
    pending: readonly PendingVaultNote[];
    files: readonly VaultProgress[];
    oversized: readonly string[];
    logMonthsChanged: boolean;
  }>,
): Promise<void> {
  const { lease, pending, files, oversized, logMonthsChanged } = input;
  const held = sql`exists (select 1 from ${vaultSettings} where ${vaultHolding(lease)})`;
  const sameSettings = sql`exists (select 1 from ${vaultSettings} where ${sameVaultTarget(lease)})`;
  await db.batch([
    db.update(vaultSettings).set({ nextAttemptAt: 0, rateFailures: 0 }).where(vaultHolding(lease)),
    ...pending.map(({ kind, subjectId }) =>
      queueVaultNotes(db, { kind, id: subjectId, when: sql`not (${held}) and ${sameSettings}` }),
    ),
    ...fileWrites(db, sameSettings, files),
    ...pending.map(({ kind, subjectId, sequence }) =>
      db
        .delete(mirrorNotes)
        .where(
          and(
            eq(mirrorNotes.kind, kind),
            eq(mirrorNotes.subjectId, subjectId),
            lte(mirrorNotes.sequence, sequence),
            held,
          ),
        ),
    ),
    ...oversized.flatMap((path) => loggedVaultFile(db, "vault-file-skipped", path, held)),
    ...(logMonthsChanged ? [queueVaultLog(db, held)] : []),
  ]);
}

export async function claimVaultLease(
  db: Database,
  input: Readonly<{ started: number; deadlineMs: number }>,
) {
  const [row] = await db
    .update(vaultSettings)
    .set({
      generation: sql`${vaultSettings.generation} + 1`,
      leaseUntil: input.started + input.deadlineMs,
    })
    .where(
      and(
        lte(vaultSettings.leaseUntil, VAULT_CLOCK),
        lte(vaultSettings.nextAttemptAt, VAULT_CLOCK),
        VAULT_AVAILABLE,
      ),
    )
    .returning();
  if (row === undefined) return null;
  const { generation, scanPending, wikiPending, rateFailures } = row;
  return { target: vaultDestination(row), generation, scanPending, wikiPending, rateFailures };
}

export async function finishVaultLease(
  db: Database,
  lease: Readonly<VaultLease>,
  backoff: Readonly<{ until: number | null; limited: boolean }>,
): Promise<void> {
  const until = backoff.limited
    ? Math.max(
        backoff.until ?? 0,
        backoffUntil(Date.now(), lease.rateFailures, REPEATED_LIMIT_DOUBLINGS),
      )
    : backoff.until;
  await db.batch([
    db
      .update(vaultSettings)
      .set({
        nextAttemptAt: sql`max(${vaultSettings.nextAttemptAt}, ${until ?? 0})`,
        rateFailures: backoff.limited
          ? sql`max(${vaultSettings.rateFailures}, ${lease.rateFailures + 1})`
          : sql`${vaultSettings.rateFailures}`,
      })
      .where(sameVaultTarget(lease)),
    db.update(vaultSettings).set({ leaseUntil: 0 }).where(vaultHolding(lease)),
  ]);
}
