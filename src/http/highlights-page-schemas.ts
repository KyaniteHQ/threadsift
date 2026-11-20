import { z } from "zod";

import { EntrySchema, parseCursor } from "../core/contract/highlights-page-contract.ts";
import { FILTER_FIELDS, FilterCountsSchema, cursorParam } from "./schemas.ts";

export const HighlightsQuerySchema = z.object({
  ...FILTER_FIELDS,
  cursor: cursorParam(parseCursor),
});

export const HighlightsPageResponseSchema = z.object({
  entries: z.array(EntrySchema).readonly(),
  next: z.string().nullable(),
  counts: FilterCountsSchema.pick({ sources: true, topics: true, tags: true }).extend({
    total: z.number().int(),
  }),
});

export type HighlightsPage = z.infer<typeof HighlightsPageResponseSchema>;
