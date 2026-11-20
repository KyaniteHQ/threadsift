import type { z } from "zod";

import { type CommentCount, type CountColumns, commentCountOf } from "../core/comment-view.ts";
import { itemPath } from "../core/item-path.ts";
import type { WaitReason } from "../core/kinds.ts";
import type { ItemRow } from "../core/schema.ts";
import { type ShownStatus, type ShownStatusInput, shownStatus } from "../core/shown-status.ts";
import { type ImageColumns, type ItemImageSchema, imageOf } from "./item-image.ts";
import type { WaitSchema } from "./item-wire.ts";

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
