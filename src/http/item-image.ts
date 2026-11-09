import { z } from "zod";

import { fileRouteOf } from "../core/file-keys.ts";

export const ItemImageSchema = z.object({ url: z.string(), alt: z.string() });

export const SizedImageSchema = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export interface ImageColumns {
  readonly imageKey: string | null;
  readonly imageAlt: string | null;
}

export function imageOf({
  imageKey,
  imageAlt,
}: Readonly<ImageColumns>): z.infer<typeof ItemImageSchema> | null {
  return imageKey === null ? null : { url: fileRouteOf(imageKey), alt: imageAlt ?? "" };
}

export type SizedImage = z.infer<typeof SizedImageSchema>;
