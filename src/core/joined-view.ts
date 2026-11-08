import { COMMENT_COUNT_COLUMNS } from "./comment-counts.ts";
import { DIGEST_VIEW_COLUMNS } from "./digest-view.ts";
import { WAIT_VIEW_COLUMNS } from "./wait-view.ts";

export const JOINED_VIEW_COLUMNS = {
  ...DIGEST_VIEW_COLUMNS,
  ...WAIT_VIEW_COLUMNS,
  ...COMMENT_COUNT_COLUMNS,
};
