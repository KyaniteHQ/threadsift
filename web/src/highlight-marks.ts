import type { PluggableList } from "unified";

import { type HastNode, type Piece, projectTree } from "../../src/core/text-projection.ts";

export interface MarkSpan {
  readonly id: number;
  readonly start: number;
  readonly length: number;
}

type Property = string | number | boolean | readonly (string | number)[] | null | undefined;

interface TreeNode {
  readonly type: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly properties?: Readonly<Record<string, Property>>;
  readonly children?: readonly TreeNode[];
}

interface Cut {
  readonly from: number;
  readonly to: number;
  readonly id: number;
}

const ASTRAL = 0xff_ff;

function unitsAfter(value: string, from: number, codePoints: number): number {
  let at = from;

  for (let seen = 0; seen < codePoints; seen += 1)
    at += (value.codePointAt(at) ?? 0) > ASTRAL ? 2 : 1;

  return at;
}

function cutOf(piece: Readonly<Piece>, span: Readonly<MarkSpan>): Cut | null {
  const start = Math.max(piece.at, span.start);
  const end = Math.min(piece.at + piece.length, span.start + span.length);
  const value = piece.node.value ?? "";

  return start < end
    ? {
        id: span.id,
        from: unitsAfter(value, piece.from, start - piece.at),
        to: unitsAfter(value, piece.from, end - piece.at),
      }
    : null;
}

function cutsByNode(
  pieces: readonly Piece[],
  spans: readonly MarkSpan[],
): ReadonlyMap<HastNode, readonly Cut[]> {
  const cuts = new Map<HastNode, Cut[]>();

  for (const piece of pieces) {
    for (const span of spans) {
      const cut = cutOf(piece, span);

      if (cut !== null) cuts.set(piece.node, [...(cuts.get(piece.node) ?? []), cut]);
    }
  }

  return cuts;
}

function marked(ids: readonly number[], children: readonly TreeNode[]): TreeNode {
  return {
    type: "element",
    tagName: "mark",
    properties: { dataHighlights: ids.join(" ") },
    children,
  };
}

function slicesOf(node: Readonly<TreeNode>, cuts: readonly Cut[]): TreeNode[] {
  if (node.type === "element") return [marked([...new Set(cuts.map(({ id }) => id))], [node])];

  const value = node.value ?? "";
  const bounds = [0, value.length, ...cuts.flatMap(({ from, to }) => [from, to])];
  const edges = [...new Set(bounds)].toSorted((a, b) => a - b);

  return edges.slice(1).map((to, at) => {
    const from = edges[at] ?? 0;
    const covering = cuts.flatMap((cut) => (cut.from <= from && to <= cut.to ? [cut.id] : []));
    const text: TreeNode = { type: node.type, value: value.slice(from, to) };

    return covering.length === 0 ? text : marked(covering, [text]);
  });
}

type CutsOf = (node: Readonly<TreeNode>) => readonly Cut[] | undefined;

function rewrite(node: Readonly<TreeNode>, cutsOf: CutsOf): TreeNode[] {
  const found = cutsOf(node);

  if (found !== undefined) return slicesOf(node, found);

  if (node.children === undefined) return [node];

  return [{ ...node, children: node.children.flatMap((child) => rewrite(child, cutsOf)) }];
}

function rehypeMarks(spans: readonly MarkSpan[]) {
  return (tree: Readonly<TreeNode>): TreeNode => {
    const cuts = cutsByNode(projectTree(tree).pieces, spans);

    return rewrite(tree, (node) => cuts.get(node))[0] ?? tree;
  };
}

export function markPlugins(spans: readonly MarkSpan[]): PluggableList {
  return spans.length === 0 ? [] : [[rehypeMarks, spans]];
}
