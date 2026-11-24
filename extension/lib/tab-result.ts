import type { z } from "zod";

import { logFailureClass } from "./log.ts";

export async function resultInTab<Schema extends z.ZodType>(
  inject: () => Promise<readonly Readonly<{ result?: unknown }>[]>,
  schema: Schema,
  event: string,
): Promise<z.infer<Schema> | null> {
  try {
    const [injected] = await inject();
    const parsed = schema.safeParse(injected?.result);

    if (parsed.success) return parsed.data;

    logFailureClass(event, parsed.error);

    return null;
  } catch (cause) {
    logFailureClass(event, cause);

    return null;
  }
}
