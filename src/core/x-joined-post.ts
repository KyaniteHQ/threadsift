import { utf8Length } from "./digest-prompt.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";
import { type JoinedAuthorThread, joinedAuthorThread } from "./x-author-thread.ts";
import type { XQuoted, XThreadValue } from "./x-wire.ts";

const NOT_SAVED_NOTE = "Quoted posts that X did not confirm were not saved.";

const PART_SEPARATOR = "\n\n";

const LINE_END = /\r\n|[\r\n\u2028\u2029]/u;

function prefixOf(depth: number): string {
  return "> ".repeat(depth + 1);
}

function quotedLine(depth: number, line: string): string {
  return line === "" ? prefixOf(depth).trimEnd() : `${prefixOf(depth)}${line}`;
}

function headerOf({ id, author, postedAt }: Readonly<XQuoted>): string {
  const time =
    postedAt === null
      ? ""
      : ` · ${new Date(postedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return `[@${author.replaceAll("_", String.raw`\_`)}${time}](https://x.com/${author}/status/${id})`;
}

function linesOf(quote: Readonly<XQuoted>, depth: number): string[] {
  const text = quote.text.trimEnd();

  return [headerOf(quote), ...(text === "" ? [] : ["", ...text.split(LINE_END)])].map((line) =>
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

function quotesKept(
  quoted: readonly Readonly<XQuoted>[],
  isKept: (id: string) => boolean,
): readonly Readonly<XQuoted>[] {
  const stop = quoted.findIndex(({ id }) => !isKept(id));

  return stop === -1 ? quoted : quoted.slice(0, stop);
}

function fittingBlock(shown: readonly Readonly<XQuoted>[], total: number, room: number): string {
  for (let count = shown.length; count >= 0; count -= 1) {
    const block = blockOf(shown.slice(0, count), count < total);

    if (block === "" || utf8Length(`${PART_SEPARATOR}${block}`) <= room) return block;
  }

  return "";
}

function joinedQuotes(
  thread: Readonly<XThreadValue>,
  shown: readonly Readonly<XQuoted>[],
): XThreadValue {
  const { post } = thread;
  const block = fittingBlock(shown, post.quoted.length, INLINE_TEXT_BYTES - utf8Length(post.text));

  return {
    ...thread,
    post: {
      ...post,
      text: block === "" ? post.text : `${post.text}${PART_SEPARATOR}${block}`,
      quoted: [],
    },
  };
}

export interface JoinedPost extends JoinedAuthorThread {
  readonly quoted: number;
}

export function joinedPost(
  thread: Readonly<XThreadValue>,
  keptReplies: Readonly<ReadonlySet<string>>,
  isQuoteKept: (id: string) => boolean,
): JoinedPost {
  const author = joinedAuthorThread(thread, keptReplies);
  const shown = quotesKept(thread.post.quoted, isQuoteKept);

  return {
    ...author,
    thread: joinedQuotes(author.thread, shown),
    quoted: shown.length,
  };
}
