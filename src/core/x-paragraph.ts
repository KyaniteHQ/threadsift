export const LINK = "\uFFFC";

const TEXT_NODE = 3;
const MEDIA_DISPLAY = /^(?:https?:\/\/)?pic\.(?:twitter|x)\.com\//u;
const WEB_DISPLAY = /^https?:\/\//u;
const MENTION_DISPLAY = /^@[\p{L}\p{N}_]/u;
const NOT_SPACE_AT_END = /\S$/u;

export function squashed(text: string): string {
  return text
    .replaceAll(new RegExp(String.raw`\s*${LINK}\s*`, "gu"), LINK)
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export interface Anchor {
  readonly href: string;
  readonly display: string;
}

export type Item =
  | { readonly kind: "text"; readonly text: string }
  | ({ readonly kind: "link" } & Anchor)
  | ({ readonly kind: "media" } & Anchor);

interface ParagraphNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly textContent: string | null;
  readonly children?: { readonly length: number } | undefined;
  readonly getAttribute?: ((name: string) => string | null) | undefined;
}

function itemOf(node: Readonly<ParagraphNode>): Item | null {
  if (node.nodeType === TEXT_NODE) return { kind: "text", text: node.textContent ?? "" };

  if (node.nodeName === "BR") return { kind: "text", text: "\n" };

  if (node.nodeName !== "A" || (node.children?.length ?? 0) > 0) return null;

  const display = node.textContent ?? "";
  const href = node.getAttribute?.("href") ?? "";

  if (MEDIA_DISPLAY.test(display)) return { kind: "media", display, href };

  if (WEB_DISPLAY.test(display))
    return { kind: "link", display, href: href === "" ? display : href };

  return { kind: "text", text: display };
}

function followsDroppedBreak(node: Readonly<ParagraphNode>, previous: Item | undefined): boolean {
  return (
    node.nodeName === "A" &&
    MENTION_DISPLAY.test(node.textContent ?? "") &&
    previous?.kind === "text" &&
    NOT_SPACE_AT_END.test(previous.text)
  );
}

export function itemsOf(
  paragraph: Readonly<{ childNodes: Readonly<Iterable<Readonly<ParagraphNode>>> }>,
): Item[] | null {
  const items: Item[] = [];

  for (const node of paragraph.childNodes) {
    const item = itemOf(node);

    if (item === null || (item.kind === "text" && item.text.includes(LINK))) return null;

    if (followsDroppedBreak(node, items.at(-1))) items.push({ kind: "text", text: "\n" });

    items.push(item);
  }

  return items;
}
