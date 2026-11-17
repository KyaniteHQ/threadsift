import type { CommentNode } from "./comment-view.ts";
import { utf8Length } from "./encoding.ts";
import { isImageRouteOf, keyOfFileRoute } from "./file-keys.ts";
import { collapsed } from "./format.ts";
import type { Kind, ReadState, Source } from "./kinds.ts";
import { inlineImage, rewriteImages, scanMarkdown } from "./markdown-images.ts";
import {
  COMMENTS_TITLE,
  CONTEXT_LABEL,
  HIGHLIGHTS_TITLE,
  KEY_POINTS_LABEL,
  NOTE_TITLE,
  NOT_FOUND,
  SECTION_TITLES,
  STUB_TEXTS,
  SUMMARY_LABEL,
  UNTITLED,
  handleOf,
} from "./reader-text.ts";

const SLUG_CODE_POINTS = 80;

const SLUG_BYTES = 240;

const SLUG_FALLBACK = "item";

const NOTE_PREFIX = "note-";

const NOTE_SUFFIX = ".md";

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

const INLINE_SPECIALS = /[\\`*_[\]<>&~|]/gu;

const BLOCK_MARKER = /^(\s{0,3})([#>+=-])/u;

const LIST_NUMBER = /^(\s{0,3}\d+)([.)])/u;

function plainMarkdown(text: string): string {
  return lineBreaksOf(text)
    .map((line) =>
      line
        .replaceAll(INLINE_SPECIALS, "\\$&")
        .replace(BLOCK_MARKER, "$1\\$2")
        .replace(LIST_NUMBER, "$1\\$2"),
    )
    .join("\n");
}

function titleOf({ title }: Readonly<Pick<ItemNoteInput, "title">>): string {
  const single = collapsed(title ?? "");

  return single === "" ? UNTITLED : plainMarkdown(single);
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
  return [...quotedLines(plainMarkdown(exact)), ...(found ? [] : ["", `*${NOT_FOUND}*`])];
}

function keyPointLines(point: string): string[] {
  return lineBreaksOf(plainMarkdown(point)).map((line, at) =>
    at === 0 ? `- ${line}` : `  ${line}`,
  );
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

function commentLines(node: Readonly<CommentNode>, source: Source): string[] {
  const prefix = depthPrefix(node.depth);

  if (node.kind !== "comment") {
    const reason = node.kind === "more" ? "more" : node.reason;

    return [`${prefix}*${CONTEXT_LABEL}: ${STUB_TEXTS[reason]}*`];
  }

  const handle = handleOf(source, node.author);

  return [
    ...(handle === "" ? [] : [`${prefix}**${plainMarkdown(handle)}**`, markers(node.depth + 1)]),
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

  return [`## ${COMMENTS_TITLE}`, "", ...lines, ""];
}

function imagesBesideNote(text: string, itemId: number): string {
  const { images } = scanMarkdown(text, false);

  return rewriteImages(
    text,
    images
      .filter(({ destination }) => isImageRouteOf(destination, itemId))
      .map((image) => ({
        image,
        text: inlineImage(image, keyOfFileRoute(image.destination)?.split("/").at(-1) ?? ""),
      })),
  );
}

export function itemNote(input: Readonly<ItemNoteInput>): string {
  const postText = input.postText === null || input.postText.trim() === "" ? null : input.postText;

  const body = [
    `# ${titleOf(input)}`,
    "",
    ...(input.summary === null
      ? []
      : [`## ${SUMMARY_LABEL}`, "", plainMarkdown(input.summary), ""]),
    ...section(
      KEY_POINTS_LABEL,
      input.keyPoints.length === 0 ? [] : [input.keyPoints.flatMap(keyPointLines)],
    ),
    ...section(HIGHLIGHTS_TITLE, input.highlights.map(highlightLines)),
    ...(input.note === null ? [] : [`## ${NOTE_TITLE}`, "", plainMarkdown(input.note), ""]),
    ...(postText === null
      ? []
      : [`## ${SECTION_TITLES[input.kind]}`, "", imagesBesideNote(postText, input.id), ""]),
    ...commentSection(input.comments, input.source),
  ];

  return `${frontMatter(input)}\n\n${body.join("\n").trimEnd()}\n`;
}

function sliced(slug: string): string {
  const points = Array.from(slug).slice(0, SLUG_CODE_POINTS);

  while (utf8Length(points.join("")) > SLUG_BYTES) points.pop();

  return points.join("").replaceAll(/-+$/gu, "");
}

function noteSlug(title: string | null): string {
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
