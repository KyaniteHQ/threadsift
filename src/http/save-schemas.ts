import { z } from "zod";

import { DigestSchema } from "../core/contract/digest-schema.ts";
import { SuppliedPageSchema, UNSUPPORTED_PAGE_LINK } from "../core/contract/supplied-page.ts";
import { ThreadAnswersSchema } from "../core/contract/thread-answers.ts";
import { HttpUrlSchema } from "./item-wire.ts";
import { ErrorResponseSchema } from "./schemas.ts";

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
