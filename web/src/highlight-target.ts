import { StoredCommentId } from "../../src/core/comment-id.ts";
import type { Highlight, HighlightTarget } from "../../src/core/highlight-contract.ts";
import type { MarkSpan } from "./highlight-marks.ts";

export const BODY_SELECTOR = ".md[data-target]";

export const POST_KEY = "post";

export function keyOf(target: Readonly<HighlightTarget>): string {
  return target.kind === "post" ? POST_KEY : target.commentId;
}

export function targetOfKey(key: string): HighlightTarget | null {
  if (key === POST_KEY) return { kind: "post" };

  const commentId = StoredCommentId.safeParse(key);

  return commentId.success ? { kind: "comment", commentId: commentId.data } : null;
}

export type SpanIndex = Readonly<Record<string, readonly MarkSpan[]>>;

export const NO_SPANS: readonly MarkSpan[] = Object.freeze([]);

export const NO_INDEX: SpanIndex = {};

function sameSpans(a: readonly MarkSpan[], b: readonly MarkSpan[]): boolean {
  return (
    a.length === b.length &&
    a.every((span, at) => {
      const other = b[at];

      return span.id === other?.id && span.start === other.start && span.length === other.length;
    })
  );
}

export function indexSpans(items: readonly Highlight[], previous: SpanIndex): SpanIndex {
  const grouped = new Map<string, MarkSpan[]>();

  for (const item of items) {
    if (item.status !== "attached") continue;

    const key = keyOf(item.target);
    const span = { id: item.id, start: item.start, length: Array.from(item.selector.exact).length };
    const list = grouped.get(key);

    if (list === undefined) grouped.set(key, [span]);
    else list.push(span);
  }

  const next = Object.fromEntries(
    Array.from(grouped, ([key, spans]) => {
      const was = previous[key];

      return [key, was !== undefined && sameSpans(was, spans) ? was : spans];
    }),
  );

  const keys = Object.keys(next);

  const unchanged =
    keys.length === Object.keys(previous).length &&
    keys.every((key) => previous[key] === next[key]);

  return unchanged ? previous : next;
}
