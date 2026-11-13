import { codePointCount } from "../../src/core/highlight-anchor.ts";
import { FOOTNOTE_LABEL_ID } from "../../src/core/reader-url.ts";
import { type HastNode, projectTree } from "../../src/core/text-projection.ts";

interface DomProjection {
  readonly text: string;
  readonly spanOf: (range: Range) => { readonly start: number; readonly end: number } | null;
}

const CODE_END: HastNode = { type: "text", value: "\n" };

function elementOf(node: HTMLElement, children: readonly HastNode[]): HastNode {
  const label = node.id.endsWith(FOOTNOTE_LABEL_ID);
  const task = node.getAttribute("aria-hidden") === "true";
  const picture = node.dataset["failedPicture"] !== undefined;

  return {
    type: "element",
    tagName: picture ? "img" : label ? "h2" : task ? "input" : node.localName,
    properties: {
      id: label ? FOOTNOTE_LABEL_ID : node.id,
      dataFootnoteRef: node.dataset["footnoteRef"],
      dataFootnoteBackref: node.dataset["footnoteBackref"],
      alt: node.getAttribute("alt") ?? undefined,
      src: node.getAttribute(picture ? "href" : "src") ?? undefined,
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
