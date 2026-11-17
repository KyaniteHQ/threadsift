import { refusedBy } from "./guards.ts";
import type { Database } from "./ports.ts";
import { restoreHoldsLibrary } from "./restore-state.ts";

const RESTORE_TRIGGER = /items_restoring: /u;

export type Closed = { readonly kind: "restoring" };

export async function whileOpen<Result>(
  db: Database,
  write: () => Promise<Result>,
): Promise<Result | Closed> {
  if (await restoreHoldsLibrary(db)) return { kind: "restoring" };

  try {
    return await write();
  } catch (error) {
    if (refusedBy(error, RESTORE_TRIGGER)) return { kind: "restoring" };

    throw error;
  }
}
