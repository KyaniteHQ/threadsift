import {
  type SQL,
  type SQLWrapper,
  and,
  asc,
  eq,
  lte,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { VaultNoteFailure } from "../contract/vault-note-failure.ts";
import type { Database } from "./database.ts";
import { report } from "./failure-log.ts";
import { hasOpenJob } from "./job-rows.ts";
import { mirrorNotes, vaultSettings, type VaultKind } from "./vault-tables.ts";

export type PendingVaultNote = Readonly<typeof mirrorNotes.$inferSelect>;

const PARK_MS = 60_000;

export function parkedUntil(): number {
  return Date.now() + PARK_MS;
}

interface Subjects {
  readonly kind: VaultKind | Readonly<SQLWrapper>;
  readonly id: number | Readonly<SQLWrapper>;
  readonly from?: SQLiteTable | SQL;
  readonly when: Readonly<SQLWrapper>;
}

export function queueVaultNotes(db: Database, { kind, id, from, when }: Readonly<Subjects>) {
  return db
    .insert(mirrorNotes)
    .select(
      db
        .select({
          sequence: sql<number>`null`.as("sequence"),
          kind: sql<VaultKind>`${kind}`.as("kind"),
          subjectId: sql<number>`${id}`.as("subject_id"),
          retryAt: sql<number>`0`.as("retry_at"),
          conflictPath: sql<null>`null`.as("conflict_path"),
        })
        .from(from ?? sql`(select 1)`)
        .where(sql`(${when}) and exists (select 1 from ${vaultSettings})`),
    )
    .onConflictDoUpdate({
      target: [mirrorNotes.kind, mirrorNotes.subjectId],
      set: { sequence: sql`excluded.sequence`, retryAt: 0 },
    });
}

export async function parkVaultNote(
  db: Database,
  note: Readonly<PendingVaultNote>,
  failure: Readonly<VaultNoteFailure>,
): Promise<void> {
  await db
    .update(mirrorNotes)
    .set({ retryAt: parkedUntil() })
    .where(
      and(
        eq(mirrorNotes.sequence, note.sequence),
        eq(mirrorNotes.kind, note.kind),
        eq(mirrorNotes.subjectId, note.subjectId),
      ),
    );
  report("vault-note-parked", {
    kind: note.kind,
    subjectId: note.subjectId,
    reason: failure.reason,
  });
}

export function dueVaultNotes(db: Database, limit: number, scope?: "item" | "topic" | "shared") {
  const kind =
    scope === "shared"
      ? notInArray(mirrorNotes.kind, ["item", "topic"])
      : scope === undefined
        ? undefined
        : eq(mirrorNotes.kind, scope);
  return db
    .select()
    .from(mirrorNotes)
    .where(
      and(
        lte(mirrorNotes.retryAt, Date.now()),
        or(
          ne(mirrorNotes.kind, "item"),
          notExists(hasOpenJob(undefined, sql`${mirrorNotes.subjectId}`)),
        ),
        kind,
      ),
    )
    .orderBy(sql`${mirrorNotes.kind} = 'log'`, asc(mirrorNotes.sequence))
    .limit(limit);
}
