import { z } from "zod";

import { FilterCountsSchema } from "./filter-counts-contract.ts";
import { EntrySchema } from "./highlights-page-contract.ts";

export const HighlightsPageResponseSchema = z.object({
  entries: z.array(EntrySchema).readonly(),
  next: z.string().nullable(),
  counts: FilterCountsSchema.pick({ sources: true, topics: true, tags: true }).extend({
    total: z.number().int(),
  }),
});

export type HighlightsPage = z.infer<typeof HighlightsPageResponseSchema>;
