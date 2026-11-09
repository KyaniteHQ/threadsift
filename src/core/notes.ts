import { type SQL, eq, sql } from "drizzle-orm";

import type { NoteView, SaveNoteRequest } from "./note-contract.ts";
import type { Database } from "./ports.ts";
import { guardedWrite, items, notes } from "./schema.ts";
import { notePartWrites } from "./search.ts";

export type SavedNote =
  | { readonly kind: "saved" | "stale"; readonly note: NoteView }
  | { readonly kind: "no-item" };

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

function noteUpsert(db: Database, itemId: number, body: string | null, revision: number) {
  const now = Date.now();
  const next = revision + 1;

  return db
    .insert(notes)
    .values({ itemId, body, revision: next, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: notes.itemId, set: { body, revision: next, updatedAt: now } })
    .returning({ body: notes.body, revision: notes.revision });
}

export async function saveNote(
  db: Database,
  itemId: number,
  { body, revision }: Readonly<SaveNoteRequest>,
): Promise<SavedNote> {
  const [saved] =
    (await guardedWrite(
      db,
      revisionHolds(itemId, revision),
      noteUpsert(db, itemId, body.trim() === "" ? null : body, revision),
      notePartWrites(db, eq(items.id, itemId)),
    )) ?? [];

  if (saved !== undefined) return { kind: "saved", note: saved };

  const [[item], [current]] = await db.batch([
    db.select({ id: items.id }).from(items).where(eq(items.id, itemId)),
    noteRows(db, itemId),
  ]);

  return item === undefined ? { kind: "no-item" } : { kind: "stale", note: noteViewOf(current) };
}
