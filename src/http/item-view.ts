import type { z } from "zod";

import { logFailure } from "../core/failure-log.ts";
import { itemPath } from "../core/item-path.ts";
import type { WaitReason } from "../core/kinds.ts";
import type { ItemRow } from "../core/schema.ts";
import { type ShownStatus, type ShownStatusInput, shownStatus } from "../core/shown-status.ts";
import { type ImageColumns, type ItemImageSchema, imageOf } from "./item-image.ts";
import { ItemSchema, type WaitSchema } from "./schemas.ts";

type StatusRow = Pick<ItemRow, "id"> &
  ShownStatusInput & {
    readonly waitReason: WaitReason | null;
    readonly retryAt: number | null;
  } & ImageColumns;

type Wait = z.infer<typeof WaitSchema>;

type StatusFields =
  | Extract<ShownStatus, { status: "failed" | "processing" }>
  | (Extract<ShownStatus, { status: "ready" }> &
      (
        | { readonly retry: "digest" | "paste"; readonly digestOutcome: "failed" }
        | { readonly retry: null; readonly digestOutcome: "none" }
      ));

function statusFields(row: Readonly<StatusRow>): StatusFields {
  const shown = shownStatus(row);

  if (shown.status !== "ready") return shown;

  return shown.retry === null
    ? { ...shown, retry: null, digestOutcome: "none" }
    : { ...shown, retry: shown.retry, digestOutcome: "failed" };
}

function waitOf({ status, waitReason, retryAt }: Readonly<StatusRow>): Wait | null {
  return status === "processing" && waitReason !== null && retryAt !== null
    ? { reason: waitReason, retryAt }
    : null;
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

  return { ...view, ...statusFields(row), wait: waitOf(row), image: imageOf(row) };
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

export function savedView<Row extends StatusRow>(row: Readonly<Row>) {
  return { item: itemView(row), url: itemPath(row.id) };
}
