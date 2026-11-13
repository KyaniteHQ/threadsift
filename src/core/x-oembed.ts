import { parseHTML } from "linkedom";
import { z } from "zod";

import { parsedJson } from "./parsed-json.ts";

const TEXT_NODE = 3;
const LINK = "\uFFFC";
const ELLIPSIS = "\u2026";
const CLOSING = String.raw`[^\s.,;:!?)\]'"”’]`;
const BEFORE_TOKEN = String.raw`(?<=^|[\s(\["“‘'])`;
const AFTER_TOKEN = String.raw`(?=$|[\s.,;:!?)\]'"”’])`;

const MIN_CUT_HEAD = 250;
const LINK_LENGTH = 23;
export const MAX_LINKS = 20;

const WEB_LINK = new RegExp(String.raw`https?://[^\s]*${CLOSING}`, "gu");
const MEDIA_DISPLAY = /^(?:https?:\/\/)?pic\.(?:twitter|x)\.com\//u;
const WEB_DISPLAY = /^https?:\/\//u;
const NOT_AUTHORIZED = "Sorry, you are not authorized";

const OembedSchema = z.object({
  url: z.string(),
  author_url: z.string(),
  html: z.string(),
});

const ProtectedSchema = z.object({ error: z.string() });

const IdOfUrl = /^https:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(?<id>[1-9]\d*)$/u;

export interface Anchor {
  readonly href: string;
  readonly display: string;
}

type Item =
  | { readonly kind: "text"; readonly text: string }
  | ({ readonly kind: "link" } & Anchor)
  | ({ readonly kind: "media" } & Anchor);

interface OembedPost {
  readonly id: string;
  readonly handle: string;
  readonly whole: string;
  readonly links: readonly Anchor[];
  readonly media: readonly Anchor[];
  readonly cut: { readonly head: string; readonly links: number } | null;
}

export type OembedAnswer =
  | { readonly kind: "post"; readonly post: OembedPost }
  | { readonly kind: "absent" }
  | { readonly kind: "unusable" }
  | { readonly kind: "unavailable" };

export type Judgement = "verified" | "tail-unverified" | "rejected";

export interface StoredPost {
  readonly id: string;
  readonly author: string;
  readonly text: string;
}

export type Resolved = ReadonlyMap<string, string>;

function squashed(text: string): string {
  return text
    .replaceAll(new RegExp(String.raw`\s*${LINK}\s*`, "gu"), LINK)
    .replaceAll(/\s+/gu, " ")
    .trim();
}

const FLATTENED: Readonly<Record<Item["kind"], (item: Readonly<Item>) => string>> = {
  text: (item) => (item.kind === "text" ? item.text : ""),
  link: () => LINK,
  media: () => "",
};

function flat(items: readonly Item[]): string {
  return squashed(items.map((item) => FLATTENED[item.kind](item)).join(""));
}

function handleOf(authorUrl: string): string | null {
  if (!URL.canParse(authorUrl)) return null;

  return new URL(authorUrl).pathname.split("/").find((part) => part !== "") ?? null;
}

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

function itemsOf(
  paragraph: Readonly<{ childNodes: Readonly<Iterable<Readonly<ParagraphNode>>> }>,
): Item[] | null {
  const items: Item[] = [];

  for (const node of paragraph.childNodes) {
    const item = itemOf(node);

    if (item === null || (item.kind === "text" && item.text.includes(LINK))) return null;

    items.push(item);
  }

  return items;
}

function cutOf(items: readonly Item[]): OembedPost["cut"] {
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

  return afterwards && text.length + links * (LINK_LENGTH - 1) >= MIN_CUT_HEAD
    ? { head: text, links }
    : null;
}

function anchorsOf(items: readonly Item[], kind: "link" | "media"): readonly Anchor[] {
  return items.flatMap((item) =>
    item.kind === kind ? [{ href: item.href, display: item.display }] : [],
  );
}

function oembedPostOf(body: string): OembedPost | null {
  const answer = parsedJson(OembedSchema, body);

  if (answer === null) return null;

  const paragraph = parseHTML(answer.html).document.querySelector("blockquote p");
  const id = IdOfUrl.exec(answer.url)?.groups?.["id"];
  const handle = handleOf(answer.author_url);

  if (paragraph === null || id === undefined || handle === null) return null;

  const items = itemsOf(paragraph);

  if (items === null) return null;

  return {
    id,
    handle,
    whole: flat(items),
    links: anchorsOf(items, "link"),
    media: anchorsOf(items, "media"),
    cut: cutOf(items),
  };
}

function protectedByX(body: string): boolean {
  return parsedJson(ProtectedSchema, body)?.error.startsWith(NOT_AUTHORIZED) ?? false;
}

export function oembedAnswerOf(status: number, body: string): OembedAnswer {
  if (status === 404 || status === 410) return { kind: "absent" };

  if (status === 403) return protectedByX(body) ? { kind: "absent" } : { kind: "unavailable" };

  if (status !== 200) return { kind: "unavailable" };

  const post = oembedPostOf(body);

  return post === null ? { kind: "unusable" } : { kind: "post", post };
}

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function withoutMedia(text: string, media: readonly Anchor[]): string {
  return media.reduce((rest, { display, href }) => {
    const forms = [`https://${display}`, `http://${display}`, display, href].flatMap((form) =>
      form === "" ? [] : [escaped(form)],
    );

    return rest.replace(new RegExp(`${BEFORE_TOKEN}(?:${forms.join("|")})${AFTER_TOKEN}`, "u"), "");
  }, text);
}

function tokensOf(text: string): RegExpExecArray[] {
  return [...text.matchAll(WEB_LINK)];
}

function agrees(
  token: string,
  { href, display }: Readonly<Anchor>,
  resolved: Readonly<Resolved>,
): boolean {
  return token === href || token === display || resolved.get(href) === token;
}

function marked(
  text: string,
  anchors: readonly Anchor[],
  resolved: Readonly<Resolved>,
  every: boolean,
): string | null {
  const tokens = tokensOf(text);

  if (every ? tokens.length !== anchors.length : tokens.length < anchors.length) return null;

  let out = "";
  let at = 0;

  for (const [index, anchor] of anchors.entries()) {
    const token = tokens[index];

    if (token === undefined || !agrees(token[0], anchor, resolved)) return null;

    out += text.slice(at, token.index) + LINK;
    at = token.index + token[0].length;
  }

  return squashed(out + text.slice(at));
}

export function linkCount(text: string): number {
  return tokensOf(text).length;
}

export function resolutionsNeeded(stored: string, post: Readonly<OembedPost>): readonly string[] {
  const tokens = tokensOf(withoutMedia(stored, post.media));
  const whole = tokens.length === post.links.length;
  const anchors = whole || post.cut === null ? post.links : post.links.slice(0, post.cut.links);

  return [
    ...new Set(
      anchors.flatMap(({ href, display }, index) => {
        const token = tokens[index]?.[0];

        return token === undefined || token === href || token === display ? [] : [href];
      }),
    ),
  ];
}

export function judged(
  stored: Readonly<StoredPost>,
  post: Readonly<OembedPost>,
  resolved: Readonly<Resolved>,
): Judgement {
  if (
    post.id !== stored.id ||
    post.handle.toLowerCase() !== stored.author.toLowerCase() ||
    post.links.length > MAX_LINKS ||
    stored.text.includes(LINK)
  ) {
    return "rejected";
  }

  const text = withoutMedia(stored.text, post.media);

  if (marked(text, post.links, resolved, true) === post.whole) return "verified";

  if (post.cut === null) return "rejected";

  const head = marked(text, post.links.slice(0, post.cut.links), resolved, false);

  return head?.startsWith(post.cut.head) === true ? "tail-unverified" : "rejected";
}
