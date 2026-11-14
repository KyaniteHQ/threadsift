import { z } from "zod";

const SentSchema = z.object({ body: z.string(), revision: z.number().int().nonnegative() });

const DraftSchema = SentSchema.extend({ sent: SentSchema.nullable().default(null) });

export type NoteSent = z.infer<typeof SentSchema>;

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

export function watchDraft(itemId: number, changed: (draft: NoteDraft) => void): () => void {
  const key = keyOf(itemId);
  const listeners = new AbortController();

  addEventListener(
    "storage",
    (event) => {
      const draft = event.key === key ? draftOf(itemId) : null;

      if (draft !== null) changed(draft);
    },
    { signal: listeners.signal },
  );

  return () => {
    listeners.abort();
  };
}

export function keepDraft(itemId: number, draft: Readonly<NoteDraft> | null): void {
  try {
    if (draft === null) localStorage.removeItem(keyOf(itemId));
    else localStorage.setItem(keyOf(itemId), JSON.stringify(draft));
  } catch {}
}
