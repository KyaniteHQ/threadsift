import { z } from "zod";

export const BATCH_LINKS_MAX = 100;

export const ImportNameSchema = z
  .string()
  .regex(/^[\w.-]{1,64}$/u, "1 to 64 letters, digits, `.`, `_` and `-`");

export const ImportSchema = z.object({
  name: ImportNameSchema,
  cursor: z.string().min(1).max(256),
});

export const ImportStateSchema = ImportSchema.extend({ updatedAt: z.number().int() });

export type ImportCursor = z.infer<typeof ImportSchema>;

export type ImportState = z.infer<typeof ImportStateSchema>;
