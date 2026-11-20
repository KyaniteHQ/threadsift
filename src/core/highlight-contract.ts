import { z } from "zod";

import { StoredCommentId } from "./comment-id.ts";
import { WholeCount } from "./whole-count.ts";

const HIGHLIGHT_REASONS = ["gone", "ambiguous"] as const;

export const HIGHLIGHT_STATUSES = ["attached", ...HIGHLIGHT_REASONS] as const;

const HighlightTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post") }),
  z.object({ kind: z.literal("comment"), commentId: StoredCommentId }),
]);

const ExactSchema = z
  .string()
  .refine((quote) => quote.trim() !== "", "a quote holds a character that shows")
  .refine((quote) => quote.isWellFormed(), "a quote is well-formed Unicode");

const SelectorSchema = z.object({
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  hint: WholeCount,
});

export const CreateHighlightRequestSchema = z.object({
  target: HighlightTargetSchema,
  revision: WholeCount,
  selector: SelectorSchema.extend({ exact: ExactSchema }),
});

const Recorded = {
  id: z.number().int().positive(),
  target: HighlightTargetSchema,
  selector: SelectorSchema,
  createdAt: z.number().int(),
};

const HighlightSchema = z.discriminatedUnion("status", [
  z.object({
    ...Recorded,
    status: z.literal("attached"),
    revision: WholeCount,
    start: WholeCount,
  }),
  z.object({
    ...Recorded,
    status: z.literal("unattached"),
    reason: z.enum(HIGHLIGHT_REASONS),
    revision: WholeCount.nullable(),
  }),
]);

export const HighlightsViewSchema = z.object({
  revisions: z.object({ post: WholeCount, comments: WholeCount.nullable() }),
  items: z.array(HighlightSchema).readonly(),
});

export const HighlightResponseSchema = z.object({ highlight: HighlightSchema });

export type CreateHighlightRequest = z.infer<typeof CreateHighlightRequestSchema>;

export type HighlightTarget = z.infer<typeof HighlightTargetSchema>;

export type Highlight = z.infer<typeof HighlightSchema>;

export type HighlightsView = z.infer<typeof HighlightsViewSchema>;
