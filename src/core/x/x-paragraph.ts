const LINK_LENGTH = 23;
const MIN_CUT_HEAD = 250;
const ELLIPSIS = "\u2026";
export const LINK = "\uFFFC";

const TEXT_NODE = 3;
const MEDIA_DISPLAY = /^(?:https?:\/\/)?pic\.(?:twitter|x)\.com\//u;
const WEB_DISPLAY = /^https?:\/\//u;
const MENTION_DISPLAY = /^@[\p{L}\p{N}_]/u;
const NOT_SPACE_AT_END = /\S$/u;
const EMOJI_BASE = String.raw`[\p{Emoji}--[#*0-9]]`;
const EMOJI_SEQUENCE = String.raw`[#*0-9]\uFE0F?\u20E3|\p{RGI_Emoji_Tag_Sequence}|\p{RGI_Emoji_Flag_Sequence}|${EMOJI_BASE}(?:\uFE0F?\p{Emoji_Modifier}|\uFE0F)`;
const EMOJI_PART = String.raw`(?:${EMOJI_SEQUENCE}|${EMOJI_BASE})`;
const WEIGHTED_TOKEN = new RegExp(
  String.raw`(?<emoji>${EMOJI_PART}(?:\u200D${EMOJI_PART})+|${EMOJI_SEQUENCE}|\p{RGI_Emoji})|(?<single>[\0-\u10FF\u2000-\u200D\u2010-\u201F\u2032-\u2037])|.`,
  "gsv",
);

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

function itemsOf(
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

const FLATTENED: Readonly<Record<Item["kind"], (item: Readonly<Item>) => string>> = {
  text: (item) => (item.kind === "text" ? item.text : ""),
  link: () => LINK,
  media: () => "",
};

function flat(items: readonly Item[]): string {
  return squashed(items.map((item) => FLATTENED[item.kind](item)).join(""));
}

function weightedLength(text: string): number {
  let length = 0;

  for (const match of text.normalize().matchAll(WEIGHTED_TOKEN)) {
    const [token] = match;

    if (token === LINK) {
      length += LINK_LENGTH;
      continue;
    }

    length += match.groups?.["single"] === undefined ? 2 : 1;
  }

  return length;
}

function cutOf(items: readonly Item[]): { readonly head: string; readonly links: number } | null {
  const marker = items.findLastIndex(
    (item) => item.kind === "text" && item.text.trimEnd().endsWith(ELLIPSIS),
  );

  const last = items[marker];

  if (last?.kind !== "text") return null;

  const afterwards = items
    .slice(marker + 1)
    .every((item) => item.kind !== "text" || item.text.trim() === "");

  const head = [
    ...items.slice(0, marker),
    { kind: "text", text: last.text.trimEnd().slice(0, -1) } as const,
  ];

  const text = flat(head);
  const links = head.filter((item) => item.kind === "link").length;

  return afterwards && weightedLength(text) >= MIN_CUT_HEAD ? { head: text, links } : null;
}

function anchorsOf(items: readonly Item[], kind: "link" | "media"): readonly Anchor[] {
  return items.flatMap((item) =>
    item.kind === kind ? [{ href: item.href, display: item.display }] : [],
  );
}

export function paragraphOf(node: Parameters<typeof itemsOf>[0]) {
  const items = itemsOf(node);

  return items === null
    ? null
    : {
        whole: flat(items),
        links: anchorsOf(items, "link"),
        media: anchorsOf(items, "media"),
        cut: cutOf(items),
      };
}
