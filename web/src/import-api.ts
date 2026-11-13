import { ImportStateSchema } from "../../src/core/import-contract.ts";
import type { ImportRequest } from "../../src/core/import-list.ts";
import { BatchResponseSchema } from "../../src/http/batch-schemas.ts";
import { call, parsedBody, parsedOrNull } from "./calls.ts";

export interface Counts {
  readonly added: number;
  readonly known: number;
  readonly refused: number;
}

type BatchAnswer =
  | { readonly kind: "saved"; readonly counts: Counts }
  | { readonly kind: "updating" | "network" | "rejected" };

export const NO_COUNTS: Counts = { added: 0, known: 0, refused: 0 };

export async function fetchImportCursor(name: string, signal: AbortSignal): Promise<string | null> {
  const state = await parsedOrNull("GET", `/api/imports/${name}`, ImportStateSchema, 404, {
    signal,
  });

  return state === null ? null : state.cursor;
}

function countsOf(outcomes: readonly (keyof Counts)[]): Counts {
  const tally = { added: 0, known: 0, refused: 0 };

  for (const outcome of outcomes) {
    tally[outcome] += 1;
  }

  return tally;
}

export async function postBatch(request: Readonly<ImportRequest>): Promise<BatchAnswer> {
  try {
    const response = await call("POST", "/api/items/batch", { json: request });

    if (response.status === 503) return { kind: "updating" };

    if (!response.ok) return { kind: "rejected" };

    const { results } = await parsedBody(response, BatchResponseSchema);

    return { kind: "saved", counts: countsOf(results.map(({ outcome }) => outcome)) };
  } catch {
    return { kind: "network" };
  }
}
