import type { PluggableList } from "unified";

import { unitIndexAt } from "../../src/core/highlight-anchor.ts";
import { type HastNode, type Piece, projectTree } from "../../src/core/text-projection.ts";
import { idsAttribute } from "./highlight-ids.ts";

export interface MarkSpan {
  readonly id: number;
  readonly start: number;
  readonly length: number;
}

interface Cut {
  readonly from: number;
  readonly to: number;
  readonly id: number;
}

type CutsOf = (node: Readonly<HastNode>) => readonly Cut[] | undefined;

const NO_PLUGINS: PluggableList = [];

function cutOf(piece: Readonly<Piece>, span: Readonly<MarkSpan>): Cut | null {
  const start = Math.max(piece.at, span.start);
  const end = Math.min(piece.at + piece.length, span.start + span.length);
  const value = piece.node.value ?? "";

  return start < end
    ? {
        id: span.id,
        from: unitIndexAt(value, start - piece.at, piece.from) ?? value.length,
        to: unitIndexAt(value, end - piece.at, piece.from) ?? value.length,
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
      const list = cuts.get(piece.node);

      if (cut === null) continue;

      if (list === undefined) cuts.set(piece.node, [cut]);
      else list.push(cut);
    }
  }

  return cuts;
}

function marked(ids: readonly number[], children: readonly HastNode[]): HastNode {
  return {
    type: "element",
    tagName: "mark",
    properties: { dataHighlights: idsAttribute(ids) },
    children,
  };
}

function slicesOf(node: Readonly<HastNode>, cuts: readonly Cut[]): HastNode[] {
  if (node.type === "element") return [marked([...new Set(cuts.map(({ id }) => id))], [node])];

  const value = node.value ?? "";
  const bounds = [0, value.length, ...cuts.flatMap(({ from, to }) => [from, to])];
  const edges = [...new Set(bounds)].toSorted((a, b) => a - b);

  return edges.slice(1).map((to, at) => {
    const from = edges[at] ?? 0;
    const covering = cuts.flatMap((cut) => (cut.from <= from && to <= cut.to ? [cut.id] : []));
    const text: HastNode = { type: node.type, value: value.slice(from, to) };

    return covering.length === 0 ? text : marked(covering, [text]);
  });
}

function rewrite(node: Readonly<HastNode>, cutsOf: CutsOf): HastNode[] {
  const found = cutsOf(node);

  if (found !== undefined) return slicesOf(node, found);

  if (node.children === undefined) return [node];

  return [{ ...node, children: node.children.flatMap((child) => rewrite(child, cutsOf)) }];
}

function rehypeMarks(spans: readonly MarkSpan[]) {
  return (tree: Readonly<HastNode>): HastNode => {
    const cuts = cutsByNode(projectTree(tree).pieces, spans);

    return rewrite(tree, (node) => cuts.get(node))[0] ?? tree;
  };
}

export function markPlugins(spans: readonly MarkSpan[]): PluggableList {
  return spans.length === 0 ? NO_PLUGINS : [[rehypeMarks, spans]];
}
