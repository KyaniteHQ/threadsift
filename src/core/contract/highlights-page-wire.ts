import { z } from "zod";

import { FilterCountsSchema } from "./filter-counts-contract.ts";
import { EntrySchema } from "./highlights-page-contract.ts";

const HighlightCountsSchema = FilterCountsSchema.pick({
  sources: true,
  topics: true,
  tags: true,
}).extend({
  total: z.number().int().min(0),
  highlights: z.number().int().min(0),
  notes: z.number().int().min(0),
});

export const HighlightsPageResponseSchema = z.object({
  entries: z.array(EntrySchema).readonly(),
  next: z.string().nullable(),
});

export const HighlightsListResponseSchema = HighlightsPageResponseSchema.extend({
  counts: HighlightCountsSchema,
});

export const HighlightsReadResponseSchema = HighlightsPageResponseSchema.extend({
  counts: HighlightCountsSchema.optional(),
});

export type HighlightsPage = z.infer<typeof HighlightsPageResponseSchema>;

export type HighlightsList = z.infer<typeof HighlightsListResponseSchema>;
