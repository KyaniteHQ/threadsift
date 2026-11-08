import type { z } from "zod";

export function parsedJson<Schema extends z.ZodType>(
  schema: Schema,
  text: string,
): z.output<Schema> | null {
  try {
    const result = schema.safeParse(JSON.parse(text));

    return result.success ? (result.data ?? null) : null;
  } catch {
    return null;
  }
}
