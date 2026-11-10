import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { z } from "zod";

import { FOOTNOTE_LABEL_ID, pictureText } from "./reader-url.ts";

export const PROJECTION_VERSION = 2;

interface HastProperties {
  readonly alt?: unknown;
  readonly src?: unknown;
  readonly href?: unknown;
  readonly id?: unknown;
  readonly dataHighlights?: unknown;
  readonly dataFootnoteRef?: unknown;
  readonly dataFootnoteBackref?: unknown;
}

export interface HastNode {
  readonly type: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly properties?: HastProperties;
  readonly children?: readonly HastNode[];
}

interface Cell {
  readonly char: string;
  readonly node: HastNode | null;
  readonly index: number;
}

interface Chunk {
  readonly node: HastNode | null;
  readonly value: string;
}

export interface Piece {
  readonly node: HastNode;
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly length: number;
}

interface Run {
  readonly node: HastNode;
  readonly from: number;
  to: number;
  readonly at: number;
  length: number;
}

export interface Projection {
  readonly text: string;
  readonly pieces: readonly Piece[];
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

export const TEXT = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

const COLLAPSIBLE = new Set([" ", "\t", "\n", "\f", "\r"]);

const BREAK: Cell = { char: "\n", node: null, index: 0 };

const TAB: Cell = { char: "\t", node: null, index: 0 };

function cellsOf(node: HastNode, value: string): Cell[] {
  const cells: Cell[] = [];
  let index = 0;

  for (const char of value) {
    cells.push({ char, node, index });
    index += char.length;
  }

  return cells;
}

function collapse(run: readonly (Chunk | null)[]): Cell[] {
  const cells: Cell[] = [];
  let atLineStart = true;
  let gap: Cell | null = null;

  const put = (char: string, node: HastNode | null, index: number): void => {
    if (COLLAPSIBLE.has(char)) {
      if (!atLineStart) gap ??= { char: " ", node, index };

      return;
    }

    if (gap !== null) cells.push(gap);

    cells.push({ char, node, index });
    atLineStart = false;
    gap = null;
  };

  for (const chunk of run) {
    if (chunk === null) {
      cells.push(BREAK);
      atLineStart = true;
      gap = null;
    } else {
      let index = 0;

      for (const char of chunk.value) {
        put(char, chunk.node, index);
        index += char.length;
      }
    }
  }

  const first = cells.findIndex((cell) => cell !== BREAK);

  return first === -1 ? [] : cells.slice(first, cells.findLastIndex((cell) => cell !== BREAK) + 1);
}

function joined(parts: readonly (readonly Cell[])[], separator: Cell): Cell[] {
  const cells: Cell[] = [];

  parts.forEach((part, at) => {
    if (at > 0) cells.push(separator);

    for (const cell of part) cells.push(cell);
  });

  return cells;
}

function codeCells(node: Readonly<HastNode>): Cell[] {
  return node.type === "text" || node.type === "raw"
    ? cellsOf(node, node.value ?? "")
    : (node.children ?? []).flatMap((child) => codeCells(child));
}

function isGenerated({ tagName, properties }: Readonly<HastNode>): boolean {
  if (tagName === "a") {
    return (
      properties?.dataFootnoteRef !== undefined || properties?.dataFootnoteBackref !== undefined
    );
  }

  return tagName === "h2" && properties?.id === FOOTNOTE_LABEL_ID;
}

export function imageText({ properties }: Readonly<HastNode>): string {
  return pictureText(TEXT.parse(properties?.alt), TEXT.parse(properties?.src));
}

function rowsOf(node: Readonly<HastNode>): HastNode[] {
  return (node.children ?? []).flatMap((child) => {
    if (child.tagName === "tr") return [child];

    return child.type === "element" ? rowsOf(child) : [];
  });
}

class Projector {
  private readonly blocks: Cell[][] = [];
  private readonly run: (Chunk | null)[] = [];

  public cells(): Cell[] {
    this.flush();

    return joined(this.blocks, BREAK);
  }

  public visit(node: Readonly<HastNode>): void {
    if (node.type === "text" || node.type === "raw") {
      this.run.push({ node, value: node.value ?? "" });
    } else if (node.type === "element") this.element(node);
    else this.children(node);
  }

  private children(node: Readonly<HastNode>): void {
    for (const child of node.children ?? []) this.visit(child);
  }

  private flush(): void {
    const cells = collapse(this.run);
    this.run.length = 0;

    if (cells.length > 0) this.blocks.push(cells);
  }

  private cell(cell: Readonly<HastNode>): Cell[] {
    const inner = new Projector();
    inner.children(cell);

    return inner.cells();
  }

  private table(table: Readonly<HastNode>): void {
    this.flush();

    for (const row of rowsOf(table)) {
      const cells = (row.children ?? [])
        .filter(({ tagName }) => tagName === "td" || tagName === "th")
        .map((cell) => this.cell(cell));

      if (cells.some((cell) => cell.length > 0)) this.blocks.push(joined(cells, TAB));
    }
  }

  private code(node: Readonly<HastNode>): void {
    this.flush();

    const cells = codeCells(node);

    if (cells.at(-1)?.char === "\n") cells.pop();

    if (cells.length > 0) this.blocks.push(cells);
  }

  private element(node: Readonly<HastNode>): void {
    const { tagName = "" } = node;

    if (tagName === "input" || isGenerated(node)) return;

    if (tagName === "br") this.run.push(null);
    else if (tagName === "img") this.run.push({ node, value: imageText(node) });
    else if (tagName === "pre") this.code(node);
    else if (tagName === "table") this.table(node);
    else if (FLOW.has(tagName)) {
      this.flush();
      this.children(node);
      this.flush();
    } else this.children(node);
  }
}

function piecesOf(cells: readonly Cell[]): Piece[] {
  const pieces: Run[] = [];
  let last: Run | undefined;

  cells.forEach(({ char, node, index }, at) => {
    if (node === null) return;

    if (last?.node === node && last.to === index && last.at + last.length === at) {
      last.to = index + char.length;
      last.length += 1;
    } else {
      last = { node, from: index, to: index + char.length, at, length: 1 };
      pieces.push(last);
    }
  });

  return pieces;
}

function textOf(cells: readonly Cell[]): string {
  return cells.map(({ char }) => char).join("");
}

function cellsIn(root: Readonly<HastNode>): Cell[] {
  const projector = new Projector();

  projector.visit(root);

  return projector.cells();
}

export function projectTree(root: Readonly<HastNode>): Projection {
  const cells = cellsIn(root);

  return { text: textOf(cells), pieces: piecesOf(cells) };
}

export function projectText(markdown: string): string {
  return textOf(cellsIn(PROCESSOR.runSync(PROCESSOR.parse(markdown))));
}
