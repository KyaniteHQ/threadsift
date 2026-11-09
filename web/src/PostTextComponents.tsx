import { type ReactNode, use } from "react";
import type { Components } from "react-markdown";

import { type HastNode, TEXT } from "../../src/core/text-projection.ts";
import { type CodePart, CodeBlock } from "./CodeBlock.tsx";
import { Mark } from "./Mark.tsx";
import { tableName } from "./reader-text.ts";
import { FootnoteScope, type Generated, Link, classed, scoped } from "./ReaderLink.tsx";
import { Picture } from "./StoredPicture.tsx";

interface WithNode {
  readonly node?: HastNode | undefined;
}

function textOf(node: Readonly<HastNode>): string {
  if (node.type === "text") return node.value ?? "";

  return (node.children ?? []).map((inner) => textOf(inner)).join("");
}

function firstRow(node: Readonly<HastNode>): HastNode | null {
  for (const child of node.children ?? []) {
    if (child.type === "element") {
      if (child.tagName === "tr") return child;

      const inner = firstRow(child);

      if (inner !== null) return inner;
    }
  }

  return null;
}

function columnsOf(node: Readonly<HastNode> | undefined): number {
  const row = node === undefined ? null : firstRow(node);

  return (row?.children ?? []).filter((cell) => cell.type === "element").length;
}

function Heading({
  tag: Tag,
  base,
  id,
  className,
  children,
}: Readonly<Generated & { tag: "h4" | "h5" | "h6"; base: string }>) {
  const scope = use(FootnoteScope);

  return (
    <Tag id={scoped(scope, id)} className={classed(base, className)}>
      {children}
    </Tag>
  );
}

function H2(props: Readonly<Generated>) {
  return <Heading tag="h4" base="h h-2" {...props} />;
}

function H3(props: Readonly<Generated>) {
  return <Heading tag="h5" base="h h-3" {...props} />;
}

function H4(props: Readonly<Generated>) {
  return <Heading tag="h6" base="h h-3" {...props} />;
}

function highlightsOf(node: Readonly<HastNode>): string {
  return TEXT.parse(node.properties?.dataHighlights);
}

function codePartsOf(node: Readonly<HastNode> | undefined): readonly CodePart[] {
  const children = node?.children?.find((child) => child.tagName === "code")?.children ?? [];
  let offset = 0;

  return children.map((child, at) => {
    const shown = textOf(child);
    const text = at === children.length - 1 ? shown.replace(/\n$/u, "") : shown;

    const part = {
      key: offset,
      text,
      highlights: child.tagName === "mark" ? highlightsOf(child) : null,
    };

    offset += shown.length;

    return part;
  });
}

function Block({ node }: Readonly<WithNode>) {
  const parts = codePartsOf(node);

  return <CodeBlock key={parts.map(({ text }) => text).join("")} parts={parts} />;
}

function Inline({ children }: Readonly<{ children?: ReactNode }>) {
  return <code className="il-code">{children}</code>;
}

function Table({ node, children }: Readonly<WithNode & { children?: ReactNode }>) {
  return (
    <div className="sxw tblw">
      <div className="tbl sx" data-label={tableName(columnsOf(node))}>
        <table>{children}</table>
      </div>
    </div>
  );
}

function Task({ checked }: Readonly<{ checked?: boolean | undefined }>) {
  return <span aria-hidden="true">{checked === true ? "[x] " : "[ ] "}</span>;
}

export const POST_TEXT_COMPONENTS: Components = {
  h1: H2,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H4,
  h6: H4,
  a: Link,
  img: Picture,
  pre: Block,
  code: Inline,
  table: Table,
  input: Task,
  mark: Mark,
};
