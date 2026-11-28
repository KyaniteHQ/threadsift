import { z } from "zod";

import { WholeCount } from "../../src/core/contract/whole-count.ts";
import { NOTE_DRAFTS, databaseKey } from "./database-storage.ts";

const DraftSchema = z.object({ body: z.string(), revision: WholeCount });

export type NoteDraft = z.infer<typeof DraftSchema>;

export function draftOf(itemId: number): NoteDraft | null {
  const key = databaseKey(NOTE_DRAFTS, itemId);

  try {
    const stored = key === null ? null : localStorage.getItem(key);

    return stored === null ? null : DraftSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function keepDraft(itemId: number, draft: Readonly<NoteDraft> | null): void {
  const key = databaseKey(NOTE_DRAFTS, itemId);

  if (key === null) return;

  try {
    if (draft === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch {}
}
