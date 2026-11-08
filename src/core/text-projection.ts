import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { z } from "zod";

import { FOOTNOTE_LABEL_ID, readerUrl } from "./reader-url.ts";

export const PROJECTION_VERSION = 1;

interface HastProperties {
  readonly alt?: unknown;
  readonly src?: unknown;
  readonly id?: unknown;
  readonly dataFootnoteRef?: unknown;
  readonly dataFootnoteBackref?: unknown;
}

interface HastNode {
  readonly type: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly properties?: HastProperties;
  readonly children?: readonly HastNode[];
}

const PROCESSOR = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true });

const FLOW = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "ul",
  "ol",
  "li",
  "section",
  "div",
  "hr",
]);

const COLLAPSIBLE = new Set([" ", "\t", "\n", "\f", "\r"]);

function collapse(run: readonly (string | null)[]): string {
  const pieces: string[] = [];
  let atLineStart = true;
  let pending = false;

  for (const piece of run) {
    if (piece === null) {
      pieces.push("\n");
      atLineStart = true;
      pending = false;
    } else {
      for (const char of piece) {
        if (COLLAPSIBLE.has(char)) {
          pending = !atLineStart;
        } else {
          pieces.push(pending ? ` ${char}` : char);
          atLineStart = false;
          pending = false;
        }
      }
    }
  }

  return pieces.join("").replaceAll(/^\n+|\n+$/gu, "");
}

function textContent(node: Readonly<HastNode>): string {
  if (node.type === "text" || node.type === "raw") return node.value ?? "";

  return (node.children ?? []).map((child) => textContent(child)).join("");
}

function isGenerated({ tagName, properties }: Readonly<HastNode>): boolean {
  if (tagName === "a") {
    return (
      properties?.dataFootnoteRef !== undefined || properties?.dataFootnoteBackref !== undefined
    );
  }

  return tagName === "h2" && properties?.id === FOOTNOTE_LABEL_ID;
}

function imageText({ properties }: Readonly<HastNode>): string {
  const alt = z.string().catch("").parse(properties?.alt);

  return alt === "" ? readerUrl(z.string().catch("").parse(properties?.src)) : alt;
}

function rowsOf(node: Readonly<HastNode>): HastNode[] {
  return (node.children ?? []).flatMap((child) => {
    if (child.tagName === "tr") return [child];

    return child.type === "element" ? rowsOf(child) : [];
  });
}

class Projector {
  private readonly blocks: string[] = [];
  private readonly run: (string | null)[] = [];

  public text(): string {
    this.flush();

    return this.blocks.join("\n");
  }

  public visit(node: Readonly<HastNode>): void {
    if (node.type === "text" || node.type === "raw") this.run.push(node.value ?? "");
    else if (node.type === "element") this.element(node);
    else this.children(node);
  }

  private children(node: Readonly<HastNode>): void {
    for (const child of node.children ?? []) this.visit(child);
  }

  private flush(): void {
    const text = collapse(this.run);
    this.run.length = 0;

    if (text !== "") this.blocks.push(text);
  }

  private cell(cell: Readonly<HastNode>): string {
    const inner = new Projector();
    inner.children(cell);

    return inner.text();
  }

  private table(table: Readonly<HastNode>): void {
    this.flush();

    for (const row of rowsOf(table)) {
      const cells = (row.children ?? [])
        .filter(({ tagName }) => tagName === "td" || tagName === "th")
        .map((cell) => this.cell(cell));

      if (cells.some((cell) => cell !== "")) this.blocks.push(cells.join("\t"));
    }
  }

  private code(node: Readonly<HastNode>): void {
    this.flush();

    const code = textContent(node).replace(/\n$/u, "");

    if (code !== "") this.blocks.push(code);
  }

  private element(node: Readonly<HastNode>): void {
    const { tagName = "" } = node;

    if (tagName === "input" || isGenerated(node)) return;

    if (tagName === "br") this.run.push(null);
    else if (tagName === "img") this.run.push(imageText(node));
    else if (tagName === "pre") this.code(node);
    else if (tagName === "table") this.table(node);
    else if (FLOW.has(tagName)) {
      this.flush();
      this.children(node);
      this.flush();
    } else this.children(node);
  }
}

export function projectText(markdown: string): string {
  const projector = new Projector();

  projector.visit(PROCESSOR.runSync(PROCESSOR.parse(markdown)));

  return projector.text();
}
