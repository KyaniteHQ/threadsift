import { type SQL, eq, sql } from "drizzle-orm";

import {
  type NoteView,
  type SaveNoteRequest,
  storedNoteBody,
} from "../../../core/contract/note-contract.ts";
import type { Database } from "../../../core/kernel/database.ts";
import { type Closed, heldBatch, whileOpen } from "../../../core/kernel/restore-hold.ts";
import { items, notes } from "../../../core/kernel/schema.ts";
import { STALE } from "../../../core/kernel/vault-stale.ts";
import { notePartWrites } from "./search.ts";

type SavedNote =
  | { readonly kind: "saved" | "stale"; readonly note: NoteView }
  | { readonly kind: "no-item" }
  | Closed;

const NEVER_SAVED: NoteView = { body: null, revision: 0 };

export function noteRows(db: Database, itemId: number) {
  return db
    .select({ body: notes.body, revision: notes.revision })
    .from(notes)
    .where(eq(notes.itemId, itemId));
}

export function noteViewOf(row: Readonly<NoteView> | undefined): NoteView {
  return row ?? NEVER_SAVED;
}

function revisionHolds(itemId: number, revision: number): SQL {
  return sql`exists (select 1 from ${items} where ${items.id} = ${itemId}) and coalesce((select ${notes.revision} from ${notes} where ${notes.itemId} = ${itemId}), 0) = ${revision}`;
}

function noteUpsert(db: Database, itemId: number, { body, revision }: Readonly<NoteView>) {
  const now = Date.now();

  return db
    .insert(notes)
    .values({ itemId, body, revision, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: notes.itemId, set: { body, revision, updatedAt: now } });
}

export function saveNote(
  db: Database,
  itemId: number,
  request: Readonly<SaveNoteRequest>,
): Promise<SavedNote> {
  return whileOpen(() => writtenNote(db, itemId, request));
}

async function writtenNote(
  db: Database,
  itemId: number,
  { body, revision }: Readonly<SaveNoteRequest>,
): Promise<SavedNote> {
  const item = eq(items.id, itemId);
  const next: NoteView = { body: storedNoteBody(body), revision: revision + 1 };
  const changed = sql`(select ${notes.body} from ${notes} where ${notes.itemId} = ${itemId}) is not ${next.body}`;
  const written = await heldBatch(
    db,
    [
      ...STALE.itemChanged(db, sql`${item} and ${changed}`),
      noteUpsert(db, itemId, next),
      ...notePartWrites(db, item),
    ],
    revisionHolds(itemId, revision),
  );

  if (written !== null) return { kind: "saved", note: next };

  const [[held], [current]] = await db.batch([
    db.select({ id: items.id }).from(items).where(item),
    noteRows(db, itemId),
  ]);

  return held === undefined ? { kind: "no-item" } : { kind: "stale", note: noteViewOf(current) };
}
