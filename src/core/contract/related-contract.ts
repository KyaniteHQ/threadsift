import { z } from "zod";

import { SOURCES } from "./item-contract.ts";

export const RELATED_MAX = 5;

const RelatedEntrySchema = z.object({
  id: z.number().int(),
  title: z.string().nullable(),
  source: z.enum(SOURCES),
  reason: z.string(),
});

export const RelatedSchema = z.array(RelatedEntrySchema).max(RELATED_MAX).readonly();

export type Related = z.infer<typeof RelatedSchema>;
