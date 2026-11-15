import type { CommentNode } from "./comment-view.ts";
import { isImageRouteOf, keyOfFileRoute } from "./file-keys.ts";
import type { Kind, ReadState, Source } from "./kinds.ts";
import { scanMarkdown } from "./markdown-images.ts";

const NOTE_TEXT = {
  untitled: "Untitled",
  summary: "Summary",
  keyPoints: "Key points",
  highlights: "Highlights",
  note: "Note",
  comments: "Comments",
  context: "Context",
  highlightNotFound: "Passage no longer found because the item’s text changed.",
  stubDropped: "Removed comment shown so the replies below make sense.",
  stubNotKept: "Comment not kept, shown so the replies below make sense.",
  stubMore: "Further replies were not saved.",
} as const;

const POST_TEXT_TITLES: Readonly<Record<Kind, string>> = {
  "reddit-post": "Original post",
  "reddit-comment": "Original post",
  "x-post": "Original post",
  "github-repo": "README",
  article: "Article",
  link: "Original post",
};

const SLUG_CODE_POINTS = 80;

const SLUG_BYTES = 240;

const SLUG_FALLBACK = "item";

const NOTE_PREFIX = "note-";

const NOTE_SUFFIX = ".md";

const ENCODER = new TextEncoder();

const NOT_PLAIN_YAML = /[\u007F-\u009F\u2028\u2029\uFFFE\uFFFF]/gu;

function unicodeEscape(character: string): string {
  return "\\u" + (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0");
}

function scalar(value: string | null): string {
  return JSON.stringify(value ?? "").replaceAll(NOT_PLAIN_YAML, unicodeEscape);
}

function moment(milliseconds: number | null): string {
  return scalar(milliseconds === null ? null : new Date(milliseconds).toISOString());
}

export interface NoteHighlight {
  readonly exact: string;
  readonly found: boolean;
}

export interface ItemNoteInput {
  readonly id: number;
  readonly source: Source;
  readonly kind: Kind;
  readonly url: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly postedAt: number | null;
  readonly savedAt: number;
  readonly fetchedAt: number | null;
  readonly topic: string | null;
  readonly tags: readonly string[];
  readonly readState: ReadState;
  readonly title: string | null;
  readonly summary: string | null;
  readonly keyPoints: readonly string[];
  readonly highlights: readonly NoteHighlight[];
  readonly note: string | null;
  readonly postText: string | null;
  readonly comments: readonly CommentNode[];
}

function lineBreaksOf(text: string): string[] {
  return text.split(/\r\n|\r|\n/u);
}

function titleOf({ title }: Readonly<Pick<ItemNoteInput, "title">>): string {
  const single = (title ?? "").replaceAll(/\s+/gu, " ").trim();

  return single === "" ? NOTE_TEXT.untitled : single;
}

function frontMatter(input: Readonly<ItemNoteInput>): string {
  return [
    "---",
    `id: ${String(input.id)}`,
    `source: ${scalar(input.source)}`,
    `url: ${scalar(input.url)}`,
    `author: ${scalar(input.author)}`,
    `community: ${scalar(input.community)}`,
    `posted: ${moment(input.postedAt)}`,
    `saved: ${moment(input.savedAt)}`,
    `fetched: ${moment(input.fetchedAt)}`,
    `topic: ${scalar(input.topic)}`,
    `tags: [${input.tags.map((tag) => scalar(tag)).join(", ")}]`,
    `read: ${scalar(input.readState)}`,
    "---",
  ].join("\n");
}

function quotedLines(text: string): string[] {
  return lineBreaksOf(text).map((line) => (line === "" ? ">" : `> ${line}`));
}

function highlightLines({ exact, found }: Readonly<NoteHighlight>): string[] {
  return [...quotedLines(exact), ...(found ? [] : ["", `*${NOTE_TEXT.highlightNotFound}*`])];
}

function keyPointLines(point: string): string[] {
  return lineBreaksOf(point).map((line, at) => (at === 0 ? `- ${line}` : `  ${line}`));
}

function section(heading: string, blocks: readonly (readonly string[])[]): string[] {
  return blocks.length === 0
    ? []
    : [`## ${heading}`, "", ...blocks.flatMap((lines) => [...lines, ""])];
}

function markers(count: number): string {
  return Array.from({ length: count }, () => ">").join(" ");
}

function depthPrefix(depth: number): string {
  return `${markers(depth + 1)} `;
}

const STUB_TEXTS = {
  dropped: NOTE_TEXT.stubDropped,
  "not-kept": NOTE_TEXT.stubNotKept,
  more: NOTE_TEXT.stubMore,
} as const;

function handleOf(source: Source, author: string | null): string {
  if (author === null) return "";

  if (source === "reddit") return `u/${author}`;

  return source === "x" ? `@${author}` : author;
}

function commentLines(node: Readonly<CommentNode>, source: Source): string[] {
  const prefix = depthPrefix(node.depth);

  if (node.kind !== "comment") {
    const reason = node.kind === "more" ? "more" : node.reason;

    return [`${prefix}*${NOTE_TEXT.context}: ${STUB_TEXTS[reason]}*`];
  }

  const handle = handleOf(source, node.author);

  return [
    ...(handle === "" ? [] : [`${prefix}**${handle}**`, markers(node.depth + 1)]),
    ...lineBreaksOf(node.body).map((line) =>
      line === "" ? markers(node.depth + 1) : prefix + line,
    ),
  ];
}

function commentSection(nodes: readonly CommentNode[], source: Source): string[] {
  if (nodes.length === 0) return [];

  const lines = nodes.flatMap((node, at) => [
    ...(at === 0 ? [] : [markers(node.depth)]),
    ...commentLines(node, source),
  ]);

  return [`## ${NOTE_TEXT.comments}`, "", ...lines, ""];
}

export function noteImagesBesideNote(text: string, itemId: number): string {
  const { images } = scanMarkdown(text, false);

  return images
    .filter(({ destination }) => isImageRouteOf(destination, itemId))
    .toSorted((first, second) => second.start - first.start)
    .reduce((rewritten, { start, end, destination }) => {
      const key = keyOfFileRoute(destination) ?? destination;
      const name = key.slice(key.lastIndexOf("/") + 1);
      const span = rewritten.slice(start, end);
      const at = span.lastIndexOf(destination);

      return at === -1
        ? rewritten
        : rewritten.slice(0, start + at) + name + rewritten.slice(start + at + destination.length);
    }, text);
}

export function itemNote(input: Readonly<ItemNoteInput>): string {
  const postText = input.postText === null || input.postText.trim() === "" ? null : input.postText;

  const body = [
    `# ${titleOf(input)}`,
    "",
    ...(input.summary === null ? [] : [`## ${NOTE_TEXT.summary}`, "", input.summary, ""]),
    ...section(
      NOTE_TEXT.keyPoints,
      input.keyPoints.length === 0 ? [] : [input.keyPoints.flatMap(keyPointLines)],
    ),
    ...section(NOTE_TEXT.highlights, input.highlights.map(highlightLines)),
    ...(input.note === null ? [] : [`## ${NOTE_TEXT.note}`, "", input.note, ""]),
    ...(postText === null
      ? []
      : [`## ${POST_TEXT_TITLES[input.kind]}`, "", noteImagesBesideNote(postText, input.id), ""]),
    ...commentSection(input.comments, input.source),
  ];

  return `${frontMatter(input)}\n\n${body.join("\n").trimEnd()}\n`;
}

function sliced(slug: string): string {
  const points = Array.from(slug).slice(0, SLUG_CODE_POINTS);

  while (ENCODER.encode(points.join("")).length > SLUG_BYTES) points.pop();

  return points.join("").replaceAll(/-+$/gu, "");
}

export function noteSlug(title: string | null): string {
  const lowered = (title ?? "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

  const slug = sliced(lowered);

  return slug === "" ? SLUG_FALLBACK : slug;
}

export function noteFileName(title: string | null): string {
  return `${NOTE_PREFIX}${noteSlug(title)}${NOTE_SUFFIX}`;
}
