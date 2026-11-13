import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { hasOpenJob } from "./job-rows.ts";
import type { DigestOutcome, FailureReason, ItemStatus, WaitReason } from "./kinds.ts";
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

const FAILED = sql`(${items.status} = 'failed' and ${items.reason} is not null)`;

const FOLLOWING_JOBS = sql`case when exists ${hasOpenJob()} then 'processing' else 'ready' end`;

const STATUS_NOW = sql<ItemStatus>`case when ${FAILED} then 'failed' else ${FOLLOWING_JOBS} end`;

const REASON_NOW = sql<FailureReason | null>`case when ${FAILED} then ${items.reason} end`;

export const NOT_FAILED = sql`not ${FAILED}`;

export function statusColumns(event: Readonly<StatusEvent>): StatusColumns {
  switch (event.kind) {
    case "queued":
      return { status: "processing", reason: null };
    case "settled":
      return { status: FOLLOWING_JOBS, reason: null };
    case "failed":
      return { status: "failed", reason: event.reason };
    case "jobs-changed":
      return { status: STATUS_NOW, reason: REASON_NOW };
    default: {
      const exhaustive: never = event;

      throw new Error(exhaustive);
    }
  }
}

export function newItemStatus(event: Readonly<StatusEvent>) {
  switch (event.kind) {
    case "queued":
      return { status: "processing", reason: null } as const;
    case "failed":
      return { status: "failed", reason: event.reason } as const;
    case "settled":
    case "jobs-changed":
      return { status: "ready", reason: null } as const;
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

export const STATUS_VIEW_COLUMNS = {
  status: STATUS_NOW.as("status"),
  reason: REASON_NOW.as("reason"),
};

export interface Wait {
  readonly reason: WaitReason;
  readonly retryAt: number;
}

export type ShownStatus =
  | { readonly status: "failed"; readonly reason: FailureReason; readonly retry: "paste" }
  | { readonly status: "processing"; readonly reason: null; readonly retry: null }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: "digest" | "paste";
      readonly digestOutcome: "failed";
    }
  | {
      readonly status: "ready";
      readonly reason: null;
      readonly retry: null;
      readonly digestOutcome: "none";
    };

export interface ShownStatusRow {
  readonly status: ItemStatus;
  readonly reason: FailureReason | null;
  readonly digestOutcome: DigestOutcome;
  readonly digestSource: boolean;
  readonly waitReason: WaitReason | null;
  readonly retryAt: number | null;
}

export function shownStatus({
  status,
  reason,
  digestOutcome,
  digestSource,
}: Readonly<ShownStatusRow>): ShownStatus {
  if (status === "failed" && reason !== null) return { status, reason, retry: "paste" };

  if (status === "processing") return { status, reason: null, retry: null };

  if (digestOutcome === "failed") {
    return {
      status: "ready",
      reason: null,
      retry: digestSource ? "digest" : "paste",
      digestOutcome,
    };
  }

  return { status: "ready", reason: null, retry: null, digestOutcome: "none" };
}

export function shownWait({ status, waitReason, retryAt }: Readonly<ShownStatusRow>): Wait | null {
  return status === "processing" && waitReason !== null && retryAt !== null
    ? { reason: waitReason, retryAt }
    : null;
}
