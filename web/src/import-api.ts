import { type ImportState, ImportStateSchema } from "../../src/core/contract/import-contract.ts";
import type { ImportRequest } from "../../src/core/contract/import-list.ts";
import { BatchResponseSchema } from "../../src/http/batch-schemas.ts";
import { call, parsedBody, parsedOrNull, post } from "./calls.ts";
import { isRestoring } from "./unavailable.ts";
import { IMPORT_BATCH_DEADLINE_MS } from "./write-deadlines.ts";

export interface Counts {
  readonly added: number;
  readonly known: number;
  readonly refused: number;
}

type BatchAnswer =
  | { readonly kind: "saved"; readonly counts: Counts }
  | { readonly kind: "restoring" | "network" | "rejected" }
  | { readonly kind: "unanswered" };

export const NO_COUNTS: Counts = { added: 0, known: 0, refused: 0 };

export function readImportState(
  name: string,
  signal: AbortSignal | undefined,
): Promise<ImportState | null> {
  return parsedOrNull("GET", `/api/imports/${name}`, ImportStateSchema, 404, { signal });
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
    const response = await call(post(IMPORT_BATCH_DEADLINE_MS), "/api/items/batch", {
      json: request,
    });

    if (await isRestoring(response)) return { kind: "restoring" };

    if (!response.ok) return { kind: "rejected" };

    const { results } = await parsedBody(response, BatchResponseSchema);

    return { kind: "saved", counts: countsOf(results.map(({ outcome }) => outcome)) };
  } catch (error) {
    return {
      kind:
        error instanceof DOMException && error.name === "TimeoutError" ? "unanswered" : "network",
    };
  }
}
