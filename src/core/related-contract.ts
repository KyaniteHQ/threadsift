import { z } from "zod";

import { SOURCES } from "./kinds.ts";

export const RELATED_MAX = 5;

export const RELATED_REASON_MAX = 160;

const RelatedEntrySchema = z.object({
  id: z.number().int(),
  title: z.string().nullable(),
  source: z.enum(SOURCES),
  reason: z.string(),
});

export const RelatedSchema = z.array(RelatedEntrySchema).max(RELATED_MAX).readonly();

export type Related = z.infer<typeof RelatedSchema>;
