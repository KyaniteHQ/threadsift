import { StoredCommentId } from "../../src/core/comment-id.ts";
import type { Highlight, HighlightTarget } from "../../src/core/highlight-contract.ts";
import type { MarkSpan } from "./highlight-marks.ts";

export const BODY_SELECTOR = ".md[data-target]";

const POST_KEY = "post";

export function keyOf(target: Readonly<HighlightTarget>): string {
  return target.kind === "post" ? POST_KEY : target.commentId;
}

export function targetOfKey(key: string): HighlightTarget | null {
  if (key === POST_KEY) return { kind: "post" };

  const commentId = StoredCommentId.safeParse(key);

  return commentId.success ? { kind: "comment", commentId: commentId.data } : null;
}

export function spansFor(
  items: readonly Highlight[],
  target: Readonly<HighlightTarget>,
): MarkSpan[] {
  const key = keyOf(target);

  return items.flatMap((item) =>
    item.status === "attached" && keyOf(item.target) === key
      ? [{ id: item.id, start: item.start, length: Array.from(item.selector.exact).length }]
      : [],
  );
}
