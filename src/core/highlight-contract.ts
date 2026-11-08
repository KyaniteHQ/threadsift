import { z } from "zod";

import { StoredCommentId } from "./comment-id.ts";
import { HIGHLIGHT_REASONS } from "./kinds.ts";

export const HighlightTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post") }),
  z.object({ kind: z.literal("comment"), commentId: StoredCommentId }),
]);

const ExactSchema = z
  .string()
  .refine((quote) => quote.trim() !== "", "a quote holds a character that shows")
  .refine((quote) => quote.isWellFormed(), "a quote is well-formed Unicode");

const PositionSchema = z.number().int().nonnegative();

export const SelectorSchema = z.object({
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  hint: PositionSchema,
});

export const CreateHighlightRequestSchema = z.object({
  target: HighlightTargetSchema,
  revision: PositionSchema,
  selector: SelectorSchema.extend({ exact: ExactSchema }),
});

const Recorded = {
  id: z.number().int().positive(),
  target: HighlightTargetSchema,
  selector: SelectorSchema,
  projection: z.number().int().positive(),
  createdAt: z.number().int(),
};

export const HighlightSchema = z.discriminatedUnion("status", [
  z.object({
    ...Recorded,
    status: z.literal("attached"),
    revision: PositionSchema,
    start: PositionSchema,
  }),
  z.object({
    ...Recorded,
    status: z.literal("unattached"),
    reason: z.enum(HIGHLIGHT_REASONS),
    revision: PositionSchema.nullable(),
  }),
]);

export const HighlightsViewSchema = z.object({
  revisions: z.object({ post: PositionSchema, comments: PositionSchema.nullable() }),
  items: z.array(HighlightSchema).readonly(),
});

export type CreateHighlightRequest = z.infer<typeof CreateHighlightRequestSchema>;

export type HighlightSelector = z.infer<typeof SelectorSchema>;

export type HighlightTarget = z.infer<typeof HighlightTargetSchema>;

export type Highlight = z.infer<typeof HighlightSchema>;

export type HighlightsView = z.infer<typeof HighlightsViewSchema>;
