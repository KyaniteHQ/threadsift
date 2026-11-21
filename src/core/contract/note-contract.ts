import { z } from "zod";

import { codePointCount } from "./code-points.ts";
import { WholeCount } from "./whole-count.ts";

export const NOTE_MAX_CODE_POINTS = 10_000;

export function exceedsNoteLimit(body: string): boolean {
  return codePointCount(body) > NOTE_MAX_CODE_POINTS;
}

const BodySchema = z
  .string()
  .refine((body) => body.isWellFormed(), "a Note is well-formed Unicode")
  .refine(
    (body) => !exceedsNoteLimit(body),
    `a Note holds at most ${String(NOTE_MAX_CODE_POINTS)} code points`,
  );

export const NoteViewSchema = z.object({ body: z.string().nullable(), revision: WholeCount });

export const SaveNoteRequestSchema = z.object({ body: BodySchema, revision: WholeCount });

export const NoteResponseSchema = z.object({ note: NoteViewSchema });

export const NoteConflictSchema = z.object({ error: z.string(), note: NoteViewSchema });

export function storedNoteBody(body: string): string | null {
  return body.trim() === "" ? null : body;
}

export type NoteView = z.infer<typeof NoteViewSchema>;

export type SaveNoteRequest = z.infer<typeof SaveNoteRequestSchema>;
