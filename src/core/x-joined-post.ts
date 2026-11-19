import { utf8Length } from "./encoding.ts";
import { X_QUOTES_MAX } from "./limits.ts";
import { type JoinedAuthorThread, joinedAuthorThread } from "./x-author-thread.ts";
import { LINE_BREAK, closedBlocks } from "./x-blocks.ts";
import { isImageLine, withImages } from "./x-images.ts";
import { PART_SEPARATOR, roomAfter } from "./x-inline-room.ts";
import {
  type Judged,
  judgementOn,
  photosRejectedOn,
  recipientsOmittedOn,
  rejectedPostIds,
} from "./x-verdict.ts";
import type { XQuoted, XThreadValue } from "./x-wire.ts";

const NOT_SAVED_NOTE = "Quoted posts were not saved.";

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

    if (utf8Length(`${PART_SEPARATOR}${blockOf(chain, false)}`) <= room) return chain;
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

export interface JoinedPost extends JoinedAuthorThread {
  readonly quotes: readonly Readonly<XQuoted>[];
}

function withoutUnshownPhotos<Post extends Readonly<{ id: string; images: readonly string[] }>>(
  post: Post,
  judged: Judged,
): Post {
  return photosRejectedOn(judged, post.id) ? { ...post, images: [] } : post;
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

  const { post } = thread;
  const root = withImages(closedBlocks(post.text), post.images);
  const leading = leadingQuotes(post.quoted, judged);
  const quotes = fittingQuotes(leading, roomAfter(root, LONGEST_NOTE));
  const notSaved = quotes.length < post.quoted.length || omittedQuote(thread, judged);
  const block = blockOf(quotes, notSaved);

  const author = joinedAuthorThread(
    { ...thread, post: { ...post, quoted: [] } },
    block === "" ? root : `${root}${PART_SEPARATOR}${block}`,
    keptReplies,
    new Set([...keptReplies].filter((id) => !recipientsOmittedOn(judged, id))),
  );

  return { ...author, quotes };
}
