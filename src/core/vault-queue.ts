import { type SQLWrapper, and, asc, eq, lte, sql } from "drizzle-orm";

import { report } from "./failure-log.ts";
import { hasOpenJob } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";
import { mirrorNotes, vaultSettings } from "./vault-tables.ts";

export type PendingVaultNote = Readonly<typeof mirrorNotes.$inferSelect>;

export class VaultItemFailure extends Error {
  readonly subjectId: number;
  readonly reason: "file-missing" | "file-changed" | "item-unreadable";

  constructor(input: Readonly<{ subjectId: number; reason: VaultItemFailure["reason"] }>) {
    super(input.reason);
    this.subjectId = input.subjectId;
    this.reason = input.reason;
  }
}

export function queueVaultItems(db: Database, where: Readonly<SQLWrapper>) {
  return db
    .insert(mirrorNotes)
    .select(
      db
        .select({
          sequence: sql<number>`null`.as("sequence"),
          kind: sql<"item">`'item'`.as("kind"),
          subjectId: items.id,
          retryAt: sql<number>`0`.as("retry_at"),
        })
        .from(items)
        .where(sql`${where} and exists (select 1 from ${vaultSettings})`),
    )
    .onConflictDoUpdate({
      target: [mirrorNotes.kind, mirrorNotes.subjectId],
      set: { sequence: sql`excluded.sequence`, retryAt: 0 },
    });
}

export async function parkVaultNote(
  db: Database,
  note: Readonly<PendingVaultNote>,
  failure: Readonly<VaultItemFailure>,
): Promise<void> {
  await db
    .update(mirrorNotes)
    .set({ retryAt: Date.now() + 60_000 })
    .where(
      and(
        eq(mirrorNotes.sequence, note.sequence),
        eq(mirrorNotes.kind, note.kind),
        eq(mirrorNotes.subjectId, note.subjectId),
      ),
    );
  report("vault-note-parked", { subjectId: note.subjectId, reason: failure.reason });
}

export function dueVaultNotes(db: Database, limit: number) {
  return db
    .select()
    .from(mirrorNotes)
    .where(
      and(
        lte(mirrorNotes.retryAt, Date.now()),
        sql`not exists ${hasOpenJob(undefined, sql`${mirrorNotes.subjectId}`)}`,
      ),
    )
    .orderBy(asc(mirrorNotes.sequence))
    .limit(limit);
}
