import { z } from "zod";

import { ImportSchema } from "../core/import-cursor.ts";
import { SaveItemRequestSchema } from "./save-schemas.ts";
import { SavedItemResponseSchema } from "./schemas.ts";

export const BATCH_LINKS_MAX = 100;

const BatchLinkSchema = z.strictObject({
  url: SaveItemRequestSchema.shape.url,
  digest: SaveItemRequestSchema.shape.digest,
});

export const BatchRequestSchema = z.object({
  links: z.array(BatchLinkSchema).min(1).max(BATCH_LINKS_MAX).readonly(),
  import: ImportSchema.optional(),
});

const ResultSchema = z.union([
  SavedItemResponseSchema.extend({ outcome: z.enum(["added", "known"]) }),
  z.object({ url: z.string(), outcome: z.literal("refused") }),
]);

export const BatchResponseSchema = z.object({
  results: z.array(ResultSchema).readonly(),
  import: ImportSchema.nullable(),
});
