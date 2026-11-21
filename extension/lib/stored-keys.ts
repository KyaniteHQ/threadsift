import { z } from "zod";

export const StoredSchema = z.object({
  instance: z.string().optional(),
  token: z.string().optional(),
  fill: z.boolean().optional(),
});

export type Stored = z.infer<typeof StoredSchema>;

export const FILL_KEY = "fill" satisfies keyof Stored;
