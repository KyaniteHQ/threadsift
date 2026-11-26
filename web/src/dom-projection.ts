import { codePointCount } from "../../src/core/contract/code-points.ts";
import {
  FAILED_PICTURE,
  FOOTNOTE_BACKREF,
  FOOTNOTE_BACKREF_PROPERTY,
  FOOTNOTE_LABEL,
  FOOTNOTE_LABEL_ID,
  FOOTNOTE_REF,
  FOOTNOTE_REF_PROPERTY,
  TASK_BOX,
} from "../../src/core/contract/projection-markers.ts";
import { type HastNode, projectTree } from "../../src/core/contract/text-projection.ts";

interface DomProjection {
  readonly text: string;
  readonly spanOf: (range: Range) => { readonly start: number; readonly end: number } | null;
}

const CODE_END: HastNode = { type: "text", value: "\n" };

function marker(node: HTMLElement, name: string): string | undefined {
  return node.getAttribute(name) ?? undefined;
}

function elementOf(node: HTMLElement, children: readonly HastNode[]): HastNode {
  const label = node.hasAttribute(FOOTNOTE_LABEL);
  const task = node.hasAttribute(TASK_BOX);
  const failedPicture = marker(node, FAILED_PICTURE);
  const picture = failedPicture !== undefined;

  return {
    type: "element",
    tagName: picture ? "img" : label ? "h2" : task ? "input" : node.localName,
    properties: {
      id: label ? FOOTNOTE_LABEL_ID : node.id,
      [FOOTNOTE_REF_PROPERTY]: marker(node, FOOTNOTE_REF),
      [FOOTNOTE_BACKREF_PROPERTY]: marker(node, FOOTNOTE_BACKREF),
      alt: node.getAttribute("alt") ?? undefined,
      src: failedPicture ?? node.getAttribute("src") ?? undefined,
    },
    children: picture ? [] : children,
  };
}

function adaptor() {
  const texts = new Map<HastNode, Text>();

  const adapt = (node: Node): HastNode | null => {
    if (node instanceof Text) {
      const text: HastNode = { type: "text", value: node.data };
      texts.set(text, node);

      return text;
    }

    if (!(node instanceof HTMLElement) || node.localName === "button") return null;

    const children = Array.from(node.childNodes).flatMap((child) => {
      const adapted = adapt(child);

      return adapted === null ? [] : [adapted];
    });

    return elementOf(node, node.localName === "pre" ? [...children, CODE_END] : children);
  };

  return { adapt, texts };
}

export function projectDom(root: Element): DomProjection {
  const { adapt, texts } = adaptor();
  const { text, pieces } = projectTree(adapt(root) ?? { type: "root" });

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
          start = Math.min(start, piece.at + codePointCount(dom.data.slice(piece.from, from)));
          end = Math.max(end, piece.at + codePointCount(dom.data.slice(piece.from, to)));
        }
      }

      return start === Infinity ? null : { start, end };
    },
  };
}
