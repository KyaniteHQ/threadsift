import { z } from "zod";

import { DigestSchema } from "./digest-schema.ts";
import { ErrorResponseSchema } from "./error-wire.ts";
import { HttpUrlSchema } from "./item-wire.ts";
import { SuppliedPageSchema, UNSUPPORTED_PAGE_LINK } from "./supplied-page.ts";
import { ThreadAnswersSchema } from "./thread-answers.ts";

export const SaveItemRequestSchema = z.object({
  content: ThreadAnswersSchema.optional(),
  digest: DigestSchema.optional(),
  fill: z.literal(true).optional(),
  page: SuppliedPageSchema.optional(),
  url: z.string().trim().pipe(HttpUrlSchema),
});

export const SaveRefusalSchema = ErrorResponseSchema.extend({
  code: z.literal(UNSUPPORTED_PAGE_LINK).optional(),
});

export type SaveItemInput = z.input<typeof SaveItemRequestSchema>;
