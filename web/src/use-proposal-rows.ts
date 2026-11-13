import { useCallback } from "react";

import { NO_ROWS, type RowState, reduceRows, rowOf } from "./proposal-row-state.ts";
import { useFlow } from "./use-flow.ts";

export function useProposalRows() {
  const [rows, send] = useFlow(reduceRows, NO_ROWS);

  const rowFor = useCallback((id: number): RowState => rowOf(rows, id), [rows]);

  return { rowFor, send };
}
