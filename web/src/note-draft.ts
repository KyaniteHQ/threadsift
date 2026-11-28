import { z } from "zod";

import { WholeCount } from "../../src/core/contract/whole-count.ts";
import { NOTE_DRAFTS, readEntry, removeEntry, writeEntry } from "./database-storage.ts";

const DraftSchema = z.object({ body: z.string(), revision: WholeCount });

export type NoteDraft = z.infer<typeof DraftSchema>;

export function draftOf(database: string, itemId: number): NoteDraft | null {
  const stored = readEntry(NOTE_DRAFTS, database, itemId);

  try {
    return stored === null ? null : DraftSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function keepDraft(database: string, itemId: number, draft: Readonly<NoteDraft> | null) {
  if (draft === null) removeEntry(NOTE_DRAFTS, database, itemId);
  else writeEntry(NOTE_DRAFTS, database, itemId, JSON.stringify(draft));
}
