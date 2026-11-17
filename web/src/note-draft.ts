import { z } from "zod";

const DraftSchema = z.object({ body: z.string(), revision: z.number().int().nonnegative() });

export type NoteDraft = z.infer<typeof DraftSchema>;

function keyOf(itemId: number): string {
  return `threadsift.note-draft.${String(itemId)}`;
}

export function draftOf(itemId: number): NoteDraft | null {
  try {
    const stored = localStorage.getItem(keyOf(itemId));

    return stored === null ? null : DraftSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function keepDraft(itemId: number, draft: Readonly<NoteDraft> | null): void {
  try {
    if (draft === null) localStorage.removeItem(keyOf(itemId));
    else localStorage.setItem(keyOf(itemId), JSON.stringify(draft));
  } catch {}
}
