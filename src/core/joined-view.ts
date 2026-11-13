import { COMMENT_COUNT_COLUMNS } from "./comment-counts.ts";
import { DIGEST_VIEW_COLUMNS } from "./digest-view.ts";
import { FILL_VIEW_COLUMNS } from "./fill-view.ts";
import { IMAGE_VIEW_COLUMNS } from "./image-view.ts";
import { STATUS_VIEW_COLUMNS } from "./item-status.ts";
import { WAIT_VIEW_COLUMNS } from "./wait-view.ts";

export const JOINED_VIEW_COLUMNS = {
  ...STATUS_VIEW_COLUMNS,
  ...DIGEST_VIEW_COLUMNS,
  ...WAIT_VIEW_COLUMNS,
  ...COMMENT_COUNT_COLUMNS,
  ...IMAGE_VIEW_COLUMNS,
  ...FILL_VIEW_COLUMNS,
};
