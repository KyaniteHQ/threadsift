import { z } from "zod";

import { EntrySchema, parseCursor } from "../core/highlights-page-contract.ts";
import { SOURCES } from "../core/kinds.ts";
import { FilterCountsSchema, SEARCH_MAX } from "./schemas.ts";

export const HighlightsQuerySchema = z.object({
  q: z.string().max(SEARCH_MAX).optional(),
  topic: z.string().optional(),
  tag: z.string().optional(),
  source: z.enum(SOURCES).optional(),
  cursor: z
    .string()
    .refine((text) => parseCursor(text) !== null, "not a cursor that an answer gave")
    .optional(),
});

export const HighlightsPageResponseSchema = z.object({
  entries: z.array(EntrySchema).readonly(),
  next: z.string().nullable(),
  counts: FilterCountsSchema.pick({ sources: true, topics: true, tags: true }).extend({
    total: z.number().int(),
  }),
});

export type HighlightsPage = z.infer<typeof HighlightsPageResponseSchema>;
