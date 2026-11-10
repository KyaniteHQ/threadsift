import { z } from "zod";

export const NOTE_MAX_CODE_POINTS = 10_000;

const RevisionSchema = z.number().int().nonnegative();

const BodySchema = z
  .string()
  .refine((body) => body.isWellFormed(), "a Note is well-formed Unicode")
  .refine(
    (body) => Array.from(body).length <= NOTE_MAX_CODE_POINTS,
    `a Note holds at most ${String(NOTE_MAX_CODE_POINTS)} code points`,
  );

export const NoteViewSchema = z.object({ body: z.string().nullable(), revision: RevisionSchema });

export const SaveNoteRequestSchema = z.object({ body: BodySchema, revision: RevisionSchema });

export const NoteResponseSchema = z.object({ note: NoteViewSchema });

export const NoteConflictSchema = z.object({ error: z.string(), note: NoteViewSchema });

export function storedNoteBody(body: string): string | null {
  return body.trim() === "" ? null : body;
}

export type NoteView = z.infer<typeof NoteViewSchema>;

export type SaveNoteRequest = z.infer<typeof SaveNoteRequestSchema>;
