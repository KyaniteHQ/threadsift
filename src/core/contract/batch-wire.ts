import { z } from "zod";

import { BudgetRefusalSchema } from "./error-wire.ts";
import { BATCH_LINKS_MAX, ImportSchema, ImportWriteSchema } from "./import-contract.ts";
import { SavedItemResponseSchema } from "./item-route-wire.ts";
import { SaveItemRequestSchema } from "./save-wire.ts";

const BatchLinkSchema = z.strictObject({
  url: SaveItemRequestSchema.shape.url,
  digest: SaveItemRequestSchema.shape.digest,
});

export const BatchRequestSchema = z.object({
  links: z.array(BatchLinkSchema).min(1).max(BATCH_LINKS_MAX).readonly(),
  import: ImportWriteSchema.optional(),
});

const ResultSchema = z.union([
  SavedItemResponseSchema.extend({ outcome: z.enum(["added", "known"]) }),
  z.object({ url: z.string(), outcome: z.literal("refused") }),
]);

export const BatchResponseSchema = z.object({
  results: z.array(ResultSchema).readonly(),
  import: ImportSchema.nullable(),
});

export const BatchBudgetRefusalSchema = BudgetRefusalSchema.extend({
  results: z.array(ResultSchema).readonly().optional(),
});
