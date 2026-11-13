import type { z } from "zod";

import { logFailure } from "../core/failure-log.ts";
import { itemPath } from "../core/item-path.ts";
import {
  type ShownStatus,
  type ShownStatusRow,
  type Wait,
  shownStatus,
  shownWait,
} from "../core/item-status.ts";
import type { ItemRow } from "../core/schema.ts";
import { type ImageColumns, type ItemImageSchema, imageOf } from "./item-image.ts";
import { ItemSchema } from "./schemas.ts";

type StatusRow = Pick<ItemRow, "id"> & ShownStatusRow & ImageColumns;

export function itemView<Row extends StatusRow>(
  row: Readonly<Row>,
): Omit<Row, keyof ImageColumns | "status" | "reason" | "digestSource" | "waitReason" | "retryAt"> &
  ShownStatus & {
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

  return { ...view, ...shownStatus(row), wait: shownWait(row), image: imageOf(row) };
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
