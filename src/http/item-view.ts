import type { z } from "zod";

import {
  type CommentCount,
  type CountColumns,
  commentCountOf,
} from "../core/contract/comment-view.ts";
import { fileRouteOf } from "../core/contract/file-keys.ts";
import type { ItemImageSchema } from "../core/contract/item-image.ts";
import { itemPath } from "../core/contract/item-path.ts";
import type { WaitSchema } from "../core/contract/item-wire.ts";
import type { WaitReason } from "../core/contract/job-contract.ts";
import {
  type ShownStatus,
  type ShownStatusInput,
  shownStatus,
} from "../core/contract/shown-status.ts";
import type { ItemRow } from "../core/kernel/schema.ts";

interface ImageColumns {
  readonly imageKey: string | null;
  readonly imageAlt: string | null;
}

function imageOf({
  imageKey,
  imageAlt,
}: Readonly<ImageColumns>): z.infer<typeof ItemImageSchema> | null {
  return imageKey === null ? null : { url: fileRouteOf(imageKey), alt: imageAlt ?? "" };
}

interface ViewInputs extends Pick<ShownStatusInput, "digestSource">, ImageColumns, CountColumns {
  readonly waitReason: WaitReason | null;
  readonly retryAt: number | null;
}

type StatusRow = Pick<ItemRow, "id"> &
  Omit<ShownStatusInput, "digestSource"> & { readonly inputs: ViewInputs };

type Wait = z.infer<typeof WaitSchema>;

function waitOf({
  status,
  waitReason,
  retryAt,
}: Readonly<Pick<ShownStatusInput, "status"> & ViewInputs>): Wait | null {
  return status === "processing" && waitReason !== null && retryAt !== null
    ? { reason: waitReason, retryAt }
    : null;
}

export function itemView<Row extends StatusRow>(
  row: Readonly<Row>,
): Omit<Row, "inputs" | "status" | "reason" | "digestOutcome"> &
  ShownStatus & {
    readonly wait: Wait | null;
    readonly commentCount: CommentCount | null;
    readonly image: z.infer<typeof ItemImageSchema> | null;
  } {
  const { inputs, ...view } = row;
  const read = { ...row, ...inputs };

  return {
    ...view,
    ...shownStatus(read),
    wait: waitOf(read),
    image: imageOf(inputs),
    commentCount: commentCountOf(inputs),
  };
}

export function savedView<Row extends StatusRow>(row: Readonly<Row>) {
  return { item: itemView(row), url: itemPath(row.id) };
}
