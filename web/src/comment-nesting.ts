import type { CommentNode } from "../../src/core/comment-view.ts";

export interface Branch {
  readonly node: CommentNode;
  readonly replies: readonly Branch[];
}

export function nest(nodes: readonly CommentNode[]): readonly Branch[] {
  const shown = new Set(nodes.map(({ id }) => id));
  const repliesTo = Map.groupBy(nodes, ({ parentId }) => parentId);

  const branch = (node: CommentNode): Branch => ({
    node,
    replies: (repliesTo.get(node.id) ?? []).map((reply) => branch(reply)),
  });

  return nodes.flatMap((node) =>
    node.parentId === null || !shown.has(node.parentId) ? [branch(node)] : [],
  );
}
