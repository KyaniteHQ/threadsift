import { z } from "zod";

import { ArticleReadingSchema } from "../../core/article.ts";
import { SuppliedPageSchema } from "../../core/supplied-page.ts";

const PageRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("title"), html: z.string() }),
  z.object({ kind: z.literal("article"), html: z.string(), url: z.string() }),
  z.object({ kind: z.literal("page"), page: SuppliedPageSchema }),
]);

export type PageRequest = z.infer<typeof PageRequestSchema>;

export const RequestMessageSchema = z.intersection(z.object({ id: z.number() }), PageRequestSchema);

export type RequestMessage = z.infer<typeof RequestMessageSchema>;

export const ReplySchema = z.discriminatedUnion("ok", [
  z.object({
    id: z.number(),
    ok: z.literal(true),
    value: z.union([z.string(), ArticleReadingSchema]),
  }),
  z.object({ id: z.number(), ok: z.literal(false), message: z.string() }),
]);

export type Reply = z.infer<typeof ReplySchema>;
