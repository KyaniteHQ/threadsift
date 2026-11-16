import { dataStepsFinished } from "./data-steps.ts";
import { refusedBy } from "./guards.ts";
import type { Database } from "./ports.ts";
import { restoreHoldsLibrary } from "./restore-state.ts";

const RESTORE_TRIGGER = /items_restoring: /u;

export type Closed = { readonly kind: "restoring" } | { readonly kind: "updating" };

async function libraryGate(db: Database): Promise<Closed | null> {
  if (await restoreHoldsLibrary(db)) return { kind: "restoring" };

  return (await dataStepsFinished(db)) ? null : { kind: "updating" };
}

export async function whileOpen<Result>(
  db: Database,
  write: () => Promise<Result>,
): Promise<Result | Closed> {
  const closed = await libraryGate(db);

  if (closed !== null) return closed;

  try {
    return await write();
  } catch (error) {
    if (refusedBy(error, RESTORE_TRIGGER)) return { kind: "restoring" };

    throw error;
  }
}
