import { type SQLWrapper, and, eq, gt, lte, sql } from "drizzle-orm";

import { guardedBatch } from "./guards.ts";
import type { Database } from "./ports.ts";
import { HOLDS_LIBRARY } from "./restore-state.ts";
import { restoreRuns } from "./schema.ts";
import type { VaultProgress } from "./vault-github.ts";
import type { PendingVaultNote } from "./vault-queue.ts";
import { mirrorFiles, mirrorNotes, vaultSettings } from "./vault-tables.ts";

export type VaultLease = typeof vaultSettings.$inferSelect;
export const VAULT_CLOCK = sql`cast(unixepoch('subsec') * 1000 as integer)`;
export const VAULT_AVAILABLE = sql`not exists (select 1 from ${restoreRuns} where ${HOLDS_LIBRARY})`;

export function vaultHolding(lease: Readonly<VaultLease>) {
  return and(
    eq(vaultSettings.generation, lease.generation),
    eq(vaultSettings.sealedToken, lease.sealedToken),
    gt(vaultSettings.leaseUntil, VAULT_CLOCK),
  );
}

export async function vaultCurrent(
  db: Database,
  lease: Readonly<VaultLease>,
  pending: readonly PendingVaultNote[],
): Promise<boolean> {
  const versions = JSON.stringify(
    pending.map(({ kind, subjectId, sequence }) => ({ kind, subjectId, sequence })),
  );
  const [held] = await db
    .select({ id: vaultSettings.id })
    .from(vaultSettings)
    .where(
      and(
        vaultHolding(lease),
        VAULT_AVAILABLE,
        sql`not exists (select 1 from json_each(${versions}) as expected where not exists (select 1 from ${mirrorNotes} where ${mirrorNotes.kind} = json_extract(expected.value, '$.kind') and ${mirrorNotes.subjectId} = json_extract(expected.value, '$.subjectId') and ${mirrorNotes.sequence} = json_extract(expected.value, '$.sequence')))`,
      ),
    );
  return held !== undefined;
}

export async function seedVaultInventory(
  db: Database,
  lease: Readonly<VaultLease>,
  subjects: readonly number[],
): Promise<void> {
  await guardedBatch(
    db,
    sql`exists (select 1 from ${vaultSettings} where ${vaultHolding(lease)}) and ${VAULT_AVAILABLE}`,
    [
      db
        .insert(mirrorNotes)
        .select(
          db
            .select({
              sequence: sql<number>`null`.as("sequence"),
              kind: sql<"item">`'item'`.as("kind"),
              subjectId: sql<number>`cast(value as integer)`.as("subject_id"),
              retryAt: sql<number>`0`.as("retry_at"),
            })
            .from(sql`json_each(${JSON.stringify(subjects)})`)
            .where(sql`true`),
        )
        .onConflictDoUpdate({
          target: [mirrorNotes.kind, mirrorNotes.subjectId],
          set: { sequence: sql`excluded.sequence`, retryAt: 0 },
        }),
      db.update(vaultSettings).set({ scanPending: false }).where(vaultHolding(lease)),
    ],
  );
}

function fileWrites(
  db: Database,
  sameSettings: Readonly<SQLWrapper>,
  files: readonly VaultProgress[],
) {
  return files.map((file) =>
    file.sha === null
      ? db.delete(mirrorFiles).where(and(eq(mirrorFiles.path, file.path), sameSettings))
      : db
          .insert(mirrorFiles)
          .select(
            db
              .select({
                path: sql<string>`${file.path}`.as("path"),
                kind: sql<"item">`'item'`.as("kind"),
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
  }>,
): Promise<void> {
  const { lease, pending, files } = input;
  const held = sql`exists (select 1 from ${vaultSettings} where ${vaultHolding(lease)})`;
  const sameSettings = sql`exists (select 1 from ${vaultSettings} where ${vaultSettings.sealedToken} = ${lease.sealedToken})`;
  await db.batch([
    db.update(vaultSettings).set({ nextAttemptAt: 0, rateFailures: 0 }).where(vaultHolding(lease)),
    ...pending.map(({ kind, subjectId }) =>
      db
        .insert(mirrorNotes)
        .select(
          db
            .select({
              sequence: sql<number>`null`.as("sequence"),
              kind: sql<"item">`${kind}`.as("kind"),
              subjectId: sql<number>`${subjectId}`.as("subject_id"),
              retryAt: sql<number>`0`.as("retry_at"),
            })
            .from(sql`(select 1)`)
            .where(sql`not (${held}) and ${sameSettings}`),
        )
        .onConflictDoUpdate({
          target: [mirrorNotes.kind, mirrorNotes.subjectId],
          set: { sequence: sql`excluded.sequence`, retryAt: 0 },
        }),
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
  ]);
}

export function claimVaultLease(
  db: Database,
  input: Readonly<{ started: number; deadlineMs: number }>,
) {
  return db
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
}

export async function finishVaultLease(
  db: Database,
  lease: Readonly<VaultLease>,
  backoff: Readonly<{ until: number | null; limited: boolean }>,
): Promise<void> {
  const until = backoff.limited
    ? Math.max(backoff.until ?? 0, Date.now() + 60_000 * 2 ** Math.min(lease.rateFailures, 5))
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
      .where(eq(vaultSettings.sealedToken, lease.sealedToken)),
    db.update(vaultSettings).set({ leaseUntil: 0 }).where(vaultHolding(lease)),
  ]);
}
