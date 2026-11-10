import { z } from "zod";

import { utf8Length } from "./digest-prompt.ts";

export const PAGE_BYTES = 1_000_000;

export const UNSUPPORTED_PAGE_LINK = "unsupported-link";

export const SuppliedPageSchema = z.object({
  markdown: z.string(),
  title: z.string(),
  author: z.string().optional(),
  published: z.string().optional(),
  videos: z.array(z.string()).readonly().optional(),
});

export type SuppliedPage = Readonly<z.infer<typeof SuppliedPageSchema>>;

export function pageBytes(page: SuppliedPage): number {
  return utf8Length(JSON.stringify(page));
}
