import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const vaultSettings = sqliteTable(
  "vault_settings",
  {
    id: integer("id").primaryKey(),
    repository: text("repository").notNull(),
    branch: text("branch").notNull(),
    sealedToken: text("sealed_token").notNull(),
    generation: integer("generation").notNull().default(0),
    leaseUntil: integer("lease_until").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull().default(0),
    scanPending: integer("scan_pending", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [check("vault_settings_one_row", sql`${table.id} = 1`)],
);

export const mirrorNotes = sqliteTable(
  "mirror_notes",
  {
    sequence: integer("sequence").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["item"] }).notNull(),
    subjectId: integer("subject_id").notNull(),
    retryAt: integer("retry_at").notNull().default(0),
  },
  (table) => [
    uniqueIndex("mirror_notes_subject").on(table.kind, table.subjectId),
    check("mirror_notes_kind", sql`${table.kind} in ('item')`),
    check("mirror_notes_retry", sql`${table.retryAt} >= 0`),
  ],
);

export const mirrorFiles = sqliteTable(
  "mirror_files",
  {
    path: text("path").primaryKey(),
    kind: text("kind", { enum: ["item"] }).notNull(),
    subjectId: integer("subject_id").notNull(),
  },
  (table) => [check("mirror_files_kind", sql`${table.kind} in ('item')`)],
);

export const mirrorBlobs = sqliteTable("mirror_blobs", {
  digest: text("digest").primaryKey(),
  sha: text("sha").notNull(),
});
