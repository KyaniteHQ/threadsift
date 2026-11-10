import type { PluggableList } from "unified";

import { isImageRouteOf } from "../../src/core/file-keys.ts";
import { unitIndexAt } from "../../src/core/highlight-anchor.ts";
import {
  type HastNode,
  TEXT,
  imageText,
  type Piece,
  projectTree,
} from "../../src/core/text-projection.ts";
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

function textOf(node: Readonly<HastNode>): string {
  return node.tagName === "img" ? imageText(node) : (node.value ?? "");
}

function cutOf(piece: Readonly<Piece>, span: Readonly<MarkSpan>): Cut | null {
  const start = Math.max(piece.at, span.start);
  const end = Math.min(piece.at + piece.length, span.start + span.length);
  const value = textOf(piece.node);

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

function textSlices(node: Readonly<HastNode>, cuts: readonly Cut[]): HastNode[] {
  const type = node.type === "element" ? "text" : node.type;
  const value = textOf(node);
  const bounds = [0, value.length, ...cuts.flatMap(({ from, to }) => [from, to])];
  const edges = [...new Set(bounds)].toSorted((a, b) => a - b);

  return edges.slice(1).map((to, at) => {
    const from = edges[at] ?? 0;
    const covering = cuts.flatMap((cut) => (cut.from <= from && to <= cut.to ? [cut.id] : []));
    const text: HastNode = { type, value: value.slice(from, to) };

    return covering.length === 0 ? text : marked(covering, [text]);
  });
}

function isStoredPicture(node: Readonly<HastNode> | undefined, itemId: number | null): boolean {
  return (
    node?.tagName === "img" &&
    itemId !== null &&
    isImageRouteOf(TEXT.parse(node.properties?.src), itemId)
  );
}

function isGapBetweenPictures(
  siblings: readonly HastNode[],
  at: number,
  itemId: number | null,
): boolean {
  return (
    siblings[at]?.type === "text" &&
    (siblings[at]?.value ?? "").trim() === "" &&
    isStoredPicture(siblings[at - 1], itemId) &&
    isStoredPicture(siblings[at + 1], itemId)
  );
}

function slicesOf(
  node: Readonly<HastNode>,
  cuts: readonly Cut[],
  itemId: number | null,
): HastNode[] {
  if (node.type === "element") {
    if (isStoredPicture(node, itemId)) {
      return [
        {
          ...node,
          properties: {
            ...node.properties,
            dataHighlights: idsAttribute([...new Set(cuts.map(({ id }) => id))]),
          },
        },
      ];
    }

    return [
      {
        type: "element",
        tagName: "a",
        properties: { href: node.properties?.src },
        children: textSlices(node, cuts),
      },
    ];
  }

  return textSlices(node, cuts);
}

function rewrite(node: Readonly<HastNode>, cutsOf: CutsOf, itemId: number | null): HastNode[] {
  const found = cutsOf(node);

  if (found !== undefined) return slicesOf(node, found, itemId);

  if (node.children === undefined) return [node];

  return [
    {
      ...node,
      children: node.children.flatMap((child, at, siblings) =>
        isGapBetweenPictures(siblings, at, itemId) ? [child] : rewrite(child, cutsOf, itemId),
      ),
    },
  ];
}

interface MarkOptions {
  readonly spans: readonly MarkSpan[];
  readonly itemId: number | null;
}

function rehypeMarks({ spans, itemId }: Readonly<MarkOptions>) {
  return (tree: Readonly<HastNode>): HastNode => {
    const cuts = cutsByNode(projectTree(tree).pieces, spans);

    return rewrite(tree, (node) => cuts.get(node), itemId)[0] ?? tree;
  };
}

export function markPlugins(spans: readonly MarkSpan[], itemId: number | null): PluggableList {
  return spans.length === 0 ? NO_PLUGINS : [[rehypeMarks, { spans, itemId }]];
}
