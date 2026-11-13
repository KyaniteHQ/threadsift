import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { hasOpenJob } from "./job-rows.ts";
import type { FailureReason, ItemStatus } from "./kinds.ts";
import type { Database } from "./ports.ts";
import { items } from "./schema.ts";

export type StatusEvent =
  | { readonly kind: "queued" }
  | { readonly kind: "settled" }
  | { readonly kind: "failed"; readonly reason: FailureReason }
  | { readonly kind: "jobs-changed" };

interface StatusColumns {
  readonly status: ItemStatus | SQL;
  readonly reason: FailureReason | null | SQL;
}

const OPEN_JOBS = sql`exists ${hasOpenJob()}`;

export const NO_OPEN_JOBS = sql`0`;

export const IS_FAILED = sql`(${items.status} = 'failed' and ${items.reason} is not null)`;

export const NOT_FAILED = sql`not ${IS_FAILED}`;

export function statusColumns(
  event: Readonly<StatusEvent>,
  openJobs: Readonly<SQLWrapper> = OPEN_JOBS,
): StatusColumns {
  const following = sql`case when ${openJobs} then 'processing' else 'ready' end`;

  switch (event.kind) {
    case "queued":
      return { status: "processing", reason: null };
    case "settled":
      return { status: following, reason: null };
    case "failed":
      return { status: "failed", reason: event.reason };
    case "jobs-changed":
      return {
        status: sql`case when ${IS_FAILED} then 'failed' else ${following} end`,
        reason: sql`case when ${IS_FAILED} then ${items.reason} end`,
      };
    default: {
      const exhaustive: never = event;

      throw new Error(exhaustive);
    }
  }
}

export function setStatus(db: Database, event: Readonly<StatusEvent>, where: Readonly<SQLWrapper>) {
  return db
    .update(items)
    .set(statusColumns(event))
    .where(sql`${where}`);
}

const NOW = statusColumns({ kind: "jobs-changed" });

export const STATUS_VIEW_COLUMNS = {
  status: sql<ItemStatus>`${NOW.status}`.as("status"),
  reason: sql<FailureReason | null>`${NOW.reason}`.as("reason"),
};
