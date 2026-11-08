import type { Item } from "../../src/http/schemas.ts";

export interface CommentCounts {
  readonly kept: number;
  readonly total: number;
}

export function commentCountsOf({
  commentsKept: kept,
  commentsTotal: total,
}: Readonly<Pick<Item, "commentsKept" | "commentsTotal">>): CommentCounts | null {
  return kept === null || total === null || total === 0 ? null : { kept, total };
}
