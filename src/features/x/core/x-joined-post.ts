import { prefixWithin, utf8Length } from "../../../core/contract/encoding.ts";
import { INLINE_TEXT_BYTES, X_QUOTES_MAX } from "../../../core/contract/limits.ts";
import { isImageLine, withImages } from "../../../core/contract/x-images.ts";
import {
  type Judged,
  judgementOn,
  photosRejectedOn,
  recipientsOmittedOn,
  rejectedPostIds,
} from "../../../core/contract/x-verdict.ts";
import type { XPost, XQuoted, XThreadValue } from "../../../core/contract/x-wire.ts";
import { type JoinedAuthorThread, joinedAuthorThread, partText } from "./x-author-thread.ts";
import { LINE_BREAK, closedBlocks } from "./x-blocks.ts";
import { PART_SEPARATOR, partBytes, roomAfter, roomBefore } from "./x-inline-room.ts";

const NOT_SAVED_NOTE = "Quoted posts were not saved.";

const CUT_NOTE = "The end of the post, author follow-up posts and quoted posts were not saved.";

const LINK_PART = /:\/\/|\]\(|www\./iu;

const TITLE_CHARACTERS = 120;

const QUOTE_MARK = ">";

function firstLineOf(text: string): string | null {
  const lines = text.split(LINE_BREAK).map((line) => line.trim());
  const photos = lines.filter((line) => isImageLine(line)).length;
  const first = lines.find((line) => line !== "" && !isImageLine(line));

  return photos > 0 && (first === undefined || first.startsWith(QUOTE_MARK)) ? null : (first ?? "");
}

export function postTitle(text: string, author: string): string {
  const first = firstLineOf(text);

  if (first === null) return `@${author}`;

  const characters = Array.from(first);

  if (characters.length <= TITLE_CHARACTERS) return characters.join("");

  const head = characters.slice(0, TITLE_CHARACTERS + 1);
  const space = head.findLastIndex((character) => /\s/u.test(character));

  return head
    .slice(0, space > 0 ? space : TITLE_CHARACTERS)
    .join("")
    .trimEnd();
}

function prefixOf(depth: number): string {
  return "> ".repeat(depth + 1);
}

function quotedLine(depth: number, line: string): string {
  return line === "" ? prefixOf(depth).trimEnd() : `${prefixOf(depth)}${line}`;
}

const LONGEST_NOTE = `${quotedLine(X_QUOTES_MAX, "")}\n${quotedLine(X_QUOTES_MAX, NOT_SAVED_NOTE)}`;

function headerOf({ id, author, postedAt }: Readonly<XQuoted>): string {
  const time =
    postedAt === null
      ? ""
      : ` · ${new Date(postedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return `[@${author.replaceAll("_", String.raw`\_`)}${time}](https://x.com/${author}/status/${id})`;
}

function linesOf(quote: Readonly<XQuoted>, depth: number): string[] {
  const text = withImages(closedBlocks(quote.text.trimEnd()), quote.images);

  return [headerOf(quote), ...(text === "" ? [] : ["", ...text.split(LINE_BREAK)])].map((line) =>
    quotedLine(depth, line),
  );
}

function blockOf(chain: readonly Readonly<XQuoted>[], notSaved: boolean): string {
  const lines = chain.flatMap((quote, depth) => [
    ...(depth === 0 ? [] : [quotedLine(depth - 1, "")]),
    ...linesOf(quote, depth),
  ]);

  const note = notSaved
    ? [
        ...(chain.length === 0 ? [] : [quotedLine(chain.length - 1, "")]),
        quotedLine(chain.length, NOT_SAVED_NOTE),
      ]
    : [];

  return [...lines, ...note].join("\n");
}

export function leadingQuotes(
  quoted: readonly Readonly<XQuoted>[],
  judged: Judged,
): readonly Readonly<XQuoted>[] {
  const stop = quoted.findIndex(({ id }) => judgementOn(judged, id) === "rejected");

  return stop === -1 ? quoted : quoted.slice(0, stop);
}

function fittingQuotes(
  leading: readonly Readonly<XQuoted>[],
  room: number,
): readonly Readonly<XQuoted>[] {
  for (let count = leading.length; count > 0; count -= 1) {
    const chain = leading.slice(0, count);

    if (partBytes(blockOf(chain, false)) <= room) return chain;
  }

  return [];
}

function omittedQuote(thread: Readonly<XThreadValue>, judged: Judged): boolean {
  const known = new Set([
    thread.post.id,
    ...thread.replies.map(({ id }) => id),
    ...thread.post.quoted.map(({ id }) => id),
  ]);

  return rejectedPostIds(judged).some((id) => !known.has(id));
}

function wordStart(text: string): number {
  let start = text.length;

  while (start > 0 && !/\s/u.test(text.charAt(start - 1))) start -= 1;

  return start;
}

function cutAt(text: string, bytes: number): string {
  const kept = prefixWithin(text, bytes);
  const start = wordStart(kept);
  const insideWord = kept !== text && start < kept.length && !/\s/u.test(text.charAt(kept.length));

  return insideWord && start > 0 && LINK_PART.test(kept.slice(start))
    ? kept.slice(0, start).trimEnd()
    : kept;
}

function leadWithin(post: Readonly<XPost>, bytes: number): string {
  let text = post.text.trim();
  let lead = partText({ text, images: post.images });

  while (text !== "" && utf8Length(lead) > bytes) {
    text = cutAt(text, utf8Length(text) - (utf8Length(lead) - bytes));
    lead = partText({ text, images: post.images });
  }

  return lead;
}

export interface JoinedPost extends JoinedAuthorThread {
  readonly quotes: readonly Readonly<XQuoted>[];
}

function withoutUnshownPhotos<Post extends Readonly<{ id: string; images: readonly string[] }>>(
  post: Post,
  judged: Judged,
): Post {
  return photosRejectedOn(judged, post.id) ? { ...post, images: [] } : post;
}

function joinedWhole(
  thread: Readonly<XThreadValue>,
  keptReplies: Readonly<ReadonlySet<string>>,
  strict: Readonly<ReadonlySet<string>>,
  judged: Judged,
): JoinedPost {
  const { post } = thread;
  const root = partText(post);
  const leading = leadingQuotes(post.quoted, judged);
  const quotes = fittingQuotes(leading, roomAfter(root, LONGEST_NOTE));
  const notSaved = quotes.length < post.quoted.length || omittedQuote(thread, judged);
  const block = blockOf(quotes, notSaved);

  const author = joinedAuthorThread(
    {
      ...thread,
      post: { ...post, text: block === "" ? root : `${root}${PART_SEPARATOR}${block}`, quoted: [] },
    },
    keptReplies,
    strict,
    "join",
  );

  return { ...author, quotes };
}

function joinedCut(
  thread: Readonly<XThreadValue>,
  keptReplies: Readonly<ReadonlySet<string>>,
  strict: Readonly<ReadonlySet<string>>,
): JoinedPost {
  const { post } = thread;
  const text = `${leadWithin(post, roomBefore(CUT_NOTE))}${PART_SEPARATOR}${CUT_NOTE}`;

  const author = joinedAuthorThread(
    { ...thread, post: { ...post, text, quoted: [] } },
    keptReplies,
    strict,
    "leave-out",
  );

  return { ...author, quotes: [] };
}

export function joinedPost(
  shown: Readonly<XThreadValue>,
  keptReplies: Readonly<ReadonlySet<string>>,
  judged: Judged,
): JoinedPost {
  const thread: XThreadValue = {
    post: {
      ...withoutUnshownPhotos(shown.post, judged),
      quoted: shown.post.quoted.map((quote) => withoutUnshownPhotos(quote, judged)),
    },
    replies: shown.replies.map((reply) => withoutUnshownPhotos(reply, judged)),
  };

  const strict = new Set([...keptReplies].filter((id) => !recipientsOmittedOn(judged, id)));
  const whole = joinedWhole(thread, keptReplies, strict, judged);
  const grew = whole.thread.post.text !== partText(thread.post);

  return grew && utf8Length(whole.thread.post.text) > INLINE_TEXT_BYTES
    ? joinedCut(thread, keptReplies, strict)
    : whole;
}
