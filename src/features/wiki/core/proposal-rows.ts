import { type SQL, and, eq, inArray, lt, sql } from "drizzle-orm";

import { PAGE_SIZE } from "../../../core/contract/paging.ts";
import {
  type ListedState,
  ListedStateSchema,
  type ProposalKind,
} from "../../../core/contract/proposal-contract.ts";
import { proposals } from "../../../core/kernel/schema.ts";

export const PAGE_ROWS = PAGE_SIZE + 1;

export const HEAD_COLUMNS = {
  id: proposals.id,
  state: sql<ListedState>`${proposals.state}`.as("state"),
  reason: proposals.reason,
  failedRuns: sql<number>`coalesce(${proposals.failedRuns}, 0)`.as("failed_runs"),
};

export function listedAfter(
  kind: ProposalKind,
  cursor: number | null,
  ...conditions: readonly (SQL | undefined)[]
) {
  return and(
    eq(proposals.kind, kind),
    inArray(proposals.state, ListedStateSchema.options),
    cursor === null ? undefined : lt(proposals.id, cursor),
    ...conditions,
  );
}
