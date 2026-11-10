import type { z } from "zod";

export async function resultInTab<Schema extends z.ZodType>(
  inject: () => Promise<readonly Readonly<{ result?: unknown }>[]>,
  schema: Schema,
): Promise<z.infer<Schema> | null> {
  try {
    const [injected] = await inject();
    const parsed = schema.safeParse(injected?.result);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
