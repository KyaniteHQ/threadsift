import { z } from "zod";

export const BATCH_LINKS_MAX = 100;

export const IMPORT_NAME_MAX = 64;

export const IMPORT_CURSOR_MAX = 256;

export const ImportNameSchema = z
  .string()
  .regex(
    new RegExp(`^[\\w.-]{1,${String(IMPORT_NAME_MAX)}}$`, "u"),
    `1 to ${String(IMPORT_NAME_MAX)} letters, digits, \`.\`, \`_\` and \`-\``,
  );

export const ImportSchema = z.object({
  name: ImportNameSchema,
  cursor: z.string().min(1).max(IMPORT_CURSOR_MAX),
});

export const ImportWriteSchema = ImportSchema.extend({
  previous: z.string().min(1).max(IMPORT_CURSOR_MAX).nullable().optional(),
  previousUpdatedAt: z.number().int().optional(),
}).refine(
  ({ previous, previousUpdatedAt }) =>
    previousUpdatedAt === undefined || (previous ?? null) !== null,
  { message: "`previousUpdatedAt` needs a text `previous`", path: ["previousUpdatedAt"] },
);

export const ImportStateSchema = ImportSchema.extend({ updatedAt: z.number().int() });

export type ImportWrite = z.infer<typeof ImportWriteSchema>;

export type ImportCursor = z.infer<typeof ImportSchema>;

export type ImportState = z.infer<typeof ImportStateSchema>;
