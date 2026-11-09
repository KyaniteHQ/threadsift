import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { z } from "zod";

interface Offset {
  readonly offset?: number | undefined;
}

interface MarkdownNode {
  readonly type: string;
  readonly position?: { readonly start: Offset; readonly end: Offset } | undefined;
  readonly children?: readonly MarkdownNode[] | undefined;
  readonly url?: string | undefined;
  readonly alt?: string | null | undefined;
  readonly title?: string | null | undefined;
  readonly identifier?: string | undefined;
}

export const MarkdownImageSchema = z
  .object({
    start: z.number(),
    end: z.number(),
    destination: z.string(),
    alt: z.string(),
    title: z.string().nullable(),
  })
  .readonly();

export type MarkdownImage = z.infer<typeof MarkdownImageSchema>;

const PROCESSOR = unified().use(remarkParse).use(remarkGfm);

const ALT_SPECIALS = /[\\`*_~[\]<>&|]/gu;

const TITLE_SPECIALS = /["\\]/gu;

function walk(root: Readonly<MarkdownNode>): MarkdownNode[] {
  const found: MarkdownNode[] = [];
  const pending: MarkdownNode[] = [root];

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    found.push(node);
    pending.push(...(node.children ?? []).toReversed());
  }

  return found;
}

function definitionsOf(nodes: readonly MarkdownNode[]): (identifier: string) => string | undefined {
  const definitions = new Map<string, string>();

  for (const { type, identifier, url } of nodes) {
    if (type === "definition" && identifier !== undefined && !definitions.has(identifier)) {
      definitions.set(identifier, url ?? "");
    }
  }

  return (identifier) => definitions.get(identifier);
}

function imageOf(
  node: Readonly<MarkdownNode>,
  definition: (identifier: string) => string | undefined,
): MarkdownImage | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const destination = node.type === "image" ? node.url : definition(node.identifier ?? "");

  if (start === undefined || end === undefined || destination === undefined) return null;

  return { start, end, destination, alt: node.alt ?? "", title: node.title ?? null };
}

export function imagesOf(markdown: string): readonly MarkdownImage[] {
  if (!markdown.includes("![")) return [];

  const nodes = walk(PROCESSOR.parse(markdown));
  const definition = definitionsOf(nodes);

  return nodes
    .filter(({ type }) => type === "image" || type === "imageReference")
    .map((node) => imageOf(node, definition))
    .filter((image) => image !== null);
}

export function altText(alt: string): string {
  return alt.replaceAll(/\s+/gu, " ").trim().replaceAll(ALT_SPECIALS, "\\$&");
}

export function inlineImage(image: Readonly<MarkdownImage>, destination: string): string {
  const title =
    image.title === null
      ? ""
      : ` "${image.title.replaceAll(/\s+/gu, " ").replaceAll(TITLE_SPECIALS, "\\$&")}"`;

  return `![${altText(image.alt)}](${destination}${title})`;
}

export interface Edit {
  readonly image: MarkdownImage;
  readonly text: string;
}

export function rewriteImages(markdown: string, edits: readonly Edit[]): string {
  let rewritten = markdown;

  for (const { image, text } of edits.toSorted((a, b) => b.image.start - a.image.start)) {
    rewritten = rewritten.slice(0, image.start) + text + rewritten.slice(image.end);
  }

  return rewritten;
}
