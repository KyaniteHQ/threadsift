import { z } from "zod";

import { FETCH_RESULTS } from "../core/fetch-results.ts";
import { KINDS, SOURCES } from "../core/kinds.ts";

const HttpUrlSchema = z.url({ protocol: /^https?$/u });

const ItemSchema = z.object({
  id: z.number().int(),
  source: z.enum(SOURCES),
  kind: z.enum(KINDS),
  normalizedUrl: HttpUrlSchema,
  originalUrl: HttpUrlSchema,
  savedAt: z.number().int(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  community: z.string().nullable(),
  fetchedAt: z.number().int().nullable(),
});

export const SaveItemRequestSchema = z.object({
  url: z.string().trim().pipe(HttpUrlSchema),
});

export const SavedItemResponseSchema = z.object({
  item: ItemSchema,
  url: z.string(),
  fetch: z.enum(FETCH_RESULTS),
});

export const ItemListResponseSchema = z.object({
  items: z.array(ItemSchema),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  fetch: z.literal("refused").optional(),
});

export type Item = z.infer<typeof ItemSchema>;
