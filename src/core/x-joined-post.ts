import { utf8Length } from "./digest-prompt.ts";
import { INLINE_TEXT_BYTES, X_QUOTES_MAX } from "./limits.ts";
import { type JoinedAuthorThread, PART_SEPARATOR, joinedAuthorThread } from "./x-author-thread.ts";
import type { Judgement } from "./x-oembed.ts";
import type { XQuoted, XThreadValue } from "./x-wire.ts";

const NOT_SAVED_NOTE = "Quoted posts were not saved.";

export const LINE_BREAK = /\r\n|[\r\n\u2028\u2029]/u;

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;

type Judgements = Readonly<Record<string, Judgement>>;

function prefixOf(depth: number): string {
  return "> ".repeat(depth + 1);
}

function quotedLine(depth: number, line: string): string {
  return line === "" ? prefixOf(depth).trimEnd() : `${prefixOf(depth)}${line}`;
}

const NOTE_ROOM = utf8Length(
  `${PART_SEPARATOR}${quotedLine(X_QUOTES_MAX, "")}\n${quotedLine(X_QUOTES_MAX, NOT_SAVED_NOTE)}`,
);

function closedFences(text: string): string {
  let open: string | null = null;

  for (const line of text.split(LINE_BREAK)) {
    const match = FENCE.exec(line);

    if (match === null) continue;

    const fence = match[1] ?? "";
    const rest = line.slice(match[0].length);

    if (open === null) {
      if (!(fence.startsWith("`") && rest.includes("`"))) open = fence;
    } else if (
      fence.startsWith(open[0] ?? "") &&
      fence.length >= open.length &&
      rest.trim() === ""
    ) {
      open = null;
    }
  }

  return open === null ? text : `${text}\n${open}`;
}

function headerOf({ id, author, postedAt }: Readonly<XQuoted>): string {
  const time =
    postedAt === null
      ? ""
      : ` · ${new Date(postedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return `[@${author.replaceAll("_", String.raw`\_`)}${time}](https://x.com/${author}/status/${id})`;
}

function linesOf(quote: Readonly<XQuoted>, depth: number): string[] {
  const text = closedFences(quote.text.trimEnd());

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
  judged: Judgements,
): readonly Readonly<XQuoted>[] {
  const stop = quoted.findIndex(({ id }) => judged[id] === "rejected");

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

function omittedQuote(thread: Readonly<XThreadValue>, judged: Judgements): boolean {
  const known = new Set([
    thread.post.id,
    ...thread.replies.map(({ id }) => id),
    ...thread.post.quoted.map(({ id }) => id),
  ]);

  return Object.entries(judged).some(
    ([id, judgement]) => judgement === "rejected" && !known.has(id),
  );
}

export interface JoinedPost extends JoinedAuthorThread {
  readonly quotes: readonly Readonly<XQuoted>[];
}

export function joinedPost(
  thread: Readonly<XThreadValue>,
  keptReplies: Readonly<ReadonlySet<string>>,
  judged: Judgements,
): JoinedPost {
  const { post } = thread;
  const root = closedFences(post.text);
  const leading = leadingQuotes(post.quoted, judged);
  const quotes = fittingQuotes(leading, INLINE_TEXT_BYTES - utf8Length(root) - NOTE_ROOM);
  const notSaved = quotes.length < post.quoted.length || omittedQuote(thread, judged);
  const block = blockOf(quotes, notSaved);

  const author = joinedAuthorThread(
    {
      ...thread,
      post: {
        ...post,
        text: block === "" ? post.text : `${root}${PART_SEPARATOR}${block}`,
        quoted: [],
      },
    },
    keptReplies,
  );

  return { ...author, quotes };
}
