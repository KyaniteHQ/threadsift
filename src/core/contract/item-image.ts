import { z } from "zod";

export const ItemImageSchema = z.object({ url: z.string(), alt: z.string() });

export const SizedImageSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceUrl: z.string(),
});

export type SizedImage = z.infer<typeof SizedImageSchema>;
