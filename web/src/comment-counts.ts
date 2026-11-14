import type { CommentCount, CommentsFilter } from "../../src/core/comment-view.ts";
import type { Item, ItemDetail } from "../../src/http/schemas.ts";

export function commentCountOf({
  commentCount,
  commentsKept,
  commentsTotal,
}: Readonly<Pick<Item, "commentCount" | "commentsKept" | "commentsTotal">>): CommentCount | null {
  if (commentCount !== undefined) return commentCount;

  return commentsKept === null || commentsTotal === null || commentsTotal === 0
    ? null
    : { filter: "kept", shown: commentsKept, total: commentsTotal };
}

export function commentsFilterOf(
  item: Readonly<Pick<Item, "commentCount" | "commentsKept" | "commentsTotal">>,
  { view }: Readonly<Pick<ItemDetail["comments"], "view">>,
): CommentsFilter {
  if (view !== undefined) return view;

  const count = commentCountOf(item);

  if (count === null) return { filter: "absent" };

  return count.shown === 0 ? { filter: "nothing-kept", count } : { filter: "kept", count };
}
