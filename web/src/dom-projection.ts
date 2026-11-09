import { type HastNode, projectTree } from "../../src/core/text-projection.ts";

export interface DomProjection {
  readonly text: string;
  readonly spanOf: (range: Range) => { readonly start: number; readonly end: number } | null;
}

type TextOf = readonly (readonly [HastNode, Text])[];

interface Adapted {
  readonly nodes: readonly HastNode[];
  readonly texts: TextOf;
}

const NOTHING: Adapted = { nodes: [], texts: [] };

function adapt(node: Node): Adapted {
  if (node instanceof Text) {
    const text: HastNode = { type: "text", value: node.data };

    return { nodes: [text], texts: [[text, node]] };
  }

  if (!(node instanceof HTMLElement)) return NOTHING;

  const inner = Array.from(node.childNodes, (child) => adapt(child));

  const element: HastNode = {
    type: "element",
    tagName: node.localName,
    properties: {
      id: node.id,
      ariaHidden: node.getAttribute("aria-hidden") ?? undefined,
      dataFootnoteRef: node.dataset["footnoteRef"],
      dataFootnoteBackref: node.dataset["footnoteBackref"],
    },
    children: inner.flatMap(({ nodes }) => nodes),
  };

  return { nodes: [element], texts: inner.flatMap(({ texts }) => texts) };
}

function codePoints(text: string): number {
  return Array.from(text).length;
}

export function projectDom(root: Element): DomProjection {
  const { nodes, texts: pairs } = adapt(root);
  const texts = new Map(pairs);
  const { text, pieces } = projectTree(nodes[0] ?? { type: "root" });

  return {
    text,
    spanOf: (range) => {
      let start = Infinity;
      let end = -Infinity;

      for (const piece of pieces) {
        const dom = texts.get(piece.node);

        if (dom === undefined || !range.intersectsNode(dom)) continue;

        const from = Math.max(piece.from, dom === range.startContainer ? range.startOffset : 0);
        const to = Math.min(piece.to, dom === range.endContainer ? range.endOffset : dom.length);

        if (from < to) {
          start = Math.min(start, piece.at + codePoints(dom.data.slice(piece.from, from)));
          end = Math.max(end, piece.at + codePoints(dom.data.slice(piece.from, to)));
        }
      }

      return start === Infinity ? null : { start, end };
    },
  };
}
