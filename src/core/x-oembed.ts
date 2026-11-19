import { parseHTML } from "linkedom";
import { z } from "zod";

import { parsedJson } from "./parsed-json.ts";
import { type Anchor, LINK, paragraphOf, squashed } from "./x-paragraph.ts";
import { rejectedQuotes, withoutQuoteLink } from "./x-quote-link.ts";

const CLOSING = String.raw`[^\s.,;:!?)\]'"”’]`;
const BEFORE_TOKEN = String.raw`(?<=^|[\s(\["“‘'])`;
const AFTER_TOKEN = String.raw`(?=$|[\s.,;:!?)\]'"”’])`;

export const MAX_LINKS = 20;

const WEB_LINK = new RegExp(String.raw`https?://[^\s]*${CLOSING}`, "gu");
const STATUS_NOT_AUTHORIZED = "Sorry, you are not authorized to see this status.";

const OembedSchema = z.object({
  url: z.string(),
  author_url: z.string(),
  html: z.string(),
});

const ProtectedSchema = z.object({ error: z.string() });

const IdOfUrl = /^https:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(?<id>[1-9]\d*)$/u;

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
  readonly recipientsMayBeOmitted: boolean;
  readonly chain?: { readonly next: string | null };
  readonly photos?: boolean;
}

export interface Checked {
  readonly keptText: string;
  readonly judgement: Judgement;
  readonly rejects: readonly string[];
  readonly photoless: boolean;
}

export type Resolved = ReadonlyMap<string, string>;

function handleOf(authorUrl: string): string | null {
  if (!URL.canParse(authorUrl)) return null;

  return new URL(authorUrl).pathname.split("/").find((part) => part !== "") ?? null;
}

function oembedPostOf(body: string): OembedPost | null {
  const answer = parsedJson(OembedSchema, body);

  if (answer === null) return null;

  const paragraph = parseHTML(answer.html).document.querySelector("blockquote p");
  const id = IdOfUrl.exec(answer.url)?.groups?.["id"];
  const handle = handleOf(answer.author_url);

  if (paragraph === null || id === undefined || handle === null) return null;

  const parsed = paragraphOf(paragraph);

  return parsed === null ? null : { id, handle, ...parsed };
}

function protectedByX(body: string): boolean {
  return parsedJson(ProtectedSchema, body)?.error === STATUS_NOT_AUTHORIZED;
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

  const quoteLink =
    post.cut === null && tokens.length === post.links.length - 1 ? post.links.at(-1) : undefined;

  return [
    ...new Set([
      ...anchors.flatMap(({ href, display }, index) => {
        const token = tokens[index]?.[0];

        return token === undefined || token === href || token === display ? [] : [href];
      }),
      ...(quoteLink === undefined ? [] : [quoteLink.href]),
    ]),
  ];
}

function wholeMatches(text: string, shown: string, at: number): boolean {
  return text.length === at + shown.length && text.startsWith(shown, at);
}

function headMatches(text: string, shown: string, at: number): boolean {
  return text.startsWith(shown, at);
}

function matchingText(
  stored: Readonly<StoredPost>,
  normalized: string,
  shown: string,
  matches: typeof wholeMatches,
): string | null {
  if (matches(normalized, shown, 0)) return stored.text;
  if (!stored.recipientsMayBeOmitted || normalized === "") return null;

  const mention = /@[A-Za-z0-9_]{1,15}\s+/uy;
  mention.lastIndex = stored.text.length - stored.text.trimStart().length;
  let at = 0;

  for (let word = mention.exec(stored.text); word !== null; word = mention.exec(stored.text)) {
    const name = word[0].trimEnd();
    if (!normalized.startsWith(name, at)) return null;
    at += name.length;
    if (normalized[at] === " ") at += 1;
    if (at < normalized.length && matches(normalized, shown, at))
      return stored.text.slice(mention.lastIndex);
  }
  return null;
}

function judgedAs(
  stored: Readonly<StoredPost>,
  post: Readonly<OembedPost>,
  resolved: Readonly<Resolved>,
): Pick<Checked, "judgement" | "keptText"> {
  const rejected = { judgement: "rejected", keptText: stored.text } as const;

  if (
    post.id !== stored.id ||
    post.handle.toLowerCase() !== stored.author.toLowerCase() ||
    post.links.length > MAX_LINKS ||
    stored.text.includes(LINK)
  ) {
    return rejected;
  }

  const text = withoutMedia(stored.text, post.media);

  const whole = marked(text, post.links, resolved, true);
  const exact = whole === null ? null : matchingText(stored, whole, post.whole, wholeMatches);
  if (exact !== null) return { judgement: "verified", keptText: exact };
  if (post.cut === null) return rejected;

  const head = marked(text, post.links.slice(0, post.cut.links), resolved, false);
  const cut = head === null ? null : matchingText(stored, head, post.cut.head, headMatches);

  return cut === null ? rejected : { judgement: "tail-unverified", keptText: cut };
}

function checkText(
  stored: Readonly<StoredPost>,
  post: Readonly<OembedPost>,
  resolved: Readonly<Resolved>,
): Checked {
  const whole = judgedAs(stored, post, resolved);
  const quote = whole.judgement === "rejected" ? withoutQuoteLink(post, resolved) : null;

  const match =
    quote === null
      ? whole
      : judgedAs(stored, { ...post, links: quote.links, whole: quote.whole }, resolved);

  if (match.judgement === "rejected") return { ...match, rejects: [], photoless: false };

  return {
    ...match,
    photoless: stored.photos === true && post.media.length === 0,
    rejects: rejectedQuotes(
      stored.chain?.next,
      quote?.target ?? null,
      post.cut === null && post.links.length === 0,
    ),
  };
}

export function checked(
  stored: Readonly<StoredPost>,
  post: Readonly<OembedPost>,
  resolved: Readonly<Resolved>,
): Checked {
  const strict = checkText({ ...stored, recipientsMayBeOmitted: false }, post, resolved);
  return strict.judgement === "rejected" &&
    stored.recipientsMayBeOmitted &&
    stored.text.trimStart().startsWith("@")
    ? checkText(stored, post, resolved)
    : strict;
}

export function judged(
  stored: Readonly<StoredPost>,
  post: Readonly<OembedPost>,
  resolved: Readonly<Resolved>,
): Judgement {
  return checked(stored, post, resolved).judgement;
}
