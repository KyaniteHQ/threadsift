import type { z } from "zod";

import { logFailure } from "../core/failure-log.ts";
import { DIGEST_OUTCOMES, type FailureReason, type WaitReason } from "../core/kinds.ts";
import type { ItemRow } from "../core/schema.ts";
import { type ImageColumns, type ItemImageSchema, imageOf } from "./item-image.ts";
import { ItemSchema, type WaitSchema } from "./schemas.ts";

type StatusFields =
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

type StatusRow = Pick<ItemRow, "id" | "status" | "reason"> & {
  readonly digestOutcome: (typeof DIGEST_OUTCOMES)[number];
  readonly digestSource: boolean;
  readonly waitReason: WaitReason | null;
  readonly retryAt: number | null;
} & ImageColumns;

type Wait = z.infer<typeof WaitSchema>;

function waitOf({ status, waitReason, retryAt }: Readonly<StatusRow>): Wait | null {
  return status === "processing" && waitReason !== null && retryAt !== null
    ? { reason: waitReason, retryAt }
    : null;
}

function statusOf(item: Readonly<StatusRow>): StatusFields {
  const { id, status, reason } = item;

  if (status === "failed") {
    if (reason === null) {
      throw new Error(`Item ${String(id)} is failed and has no reason`);
    }

    return { status, reason, retry: "paste" };
  }

  if (reason !== null) {
    throw new Error(`Item ${String(id)} is ${status} and has the reason ${reason}`);
  }

  if (status === "processing") return { status, reason, retry: null };

  if (item.digestOutcome === "pending") {
    throw new Error(`Item ${String(id)} is ready and its Digest is pending`);
  }

  if (item.digestOutcome === "none") return { status, reason, retry: null, digestOutcome: "none" };

  return {
    status,
    reason,
    retry: item.digestSource ? "digest" : "paste",
    digestOutcome: "failed",
  };
}

export function itemView<Row extends StatusRow>(
  row: Readonly<Row>,
): Omit<Row, keyof ImageColumns | "status" | "reason" | "digestSource" | "waitReason" | "retryAt"> &
  StatusFields & {
    readonly wait: Wait | null;
    readonly image: z.infer<typeof ItemImageSchema> | null;
  } {
  const {
    digestSource: _digestSource,
    waitReason: _waitReason,
    retryAt: _retryAt,
    imageKey: _imageKey,
    imageAlt: _imageAlt,
    ...view
  } = row;

  return { ...view, ...statusOf(row), wait: waitOf(row), image: imageOf(row) };
}

export function shownItems<Row extends StatusRow>(rows: readonly Readonly<Row>[]) {
  return rows.flatMap((row) => {
    try {
      const view = itemView(row);
      ItemSchema.parse(view);

      return [view];
    } catch (error) {
      logFailure("item-not-shown", { itemId: row.id }, error);

      return [];
    }
  });
}
