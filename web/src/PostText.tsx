import { type ReactNode, memo, useEffect, useRef } from "react";
import Markdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";

import { CodeBlock } from "./CodeBlock.tsx";
import { tableName } from "./reader-text.ts";
import { watchFades } from "./scroll-fades.ts";

interface Node {
  readonly type: string;
  readonly value?: string;
  readonly tagName?: string;
  readonly children?: readonly Node[];
}

interface WithNode {
  readonly node?: Node | undefined;
}

function textOf(node: Node): string {
  if (node.type === "text") return node.value ?? "";

  return (node.children ?? []).map((inner) => textOf(inner)).join("");
}

function firstRow(node: Node): Node | null {
  for (const child of node.children ?? []) {
    if (child.type === "element") {
      if (child.tagName === "tr") return child;

      const inner = firstRow(child);

      if (inner !== null) return inner;
    }
  }

  return null;
}

function columnsOf(node: Node | undefined): number {
  const row = node === undefined ? null : firstRow(node);

  return (row?.children ?? []).filter((cell) => cell.type === "element").length;
}

function safeUrl(url: string): string {
  return /^(?:https?:|mailto:|#)/iu.test(url) ? defaultUrlTransform(url) : "";
}

function H2({ children }: Readonly<{ children?: ReactNode }>) {
  return <h4 className="h h-2">{children}</h4>;
}

function H3({ children }: Readonly<{ children?: ReactNode }>) {
  return <h5 className="h h-3">{children}</h5>;
}

function H4({ children }: Readonly<{ children?: ReactNode }>) {
  return <h6 className="h h-3">{children}</h6>;
}

function Link({ href, children }: Readonly<{ href?: string | undefined; children?: ReactNode }>) {
  return href === undefined || href === "" ? (
    <span>{children}</span>
  ) : (
    <a className="il-a" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Picture({ src, alt }: Readonly<{ src?: string | undefined; alt?: string | undefined }>) {
  const href = z.string().catch("").parse(src);

  return <Link href={href}>{alt === undefined || alt === "" ? href : alt}</Link>;
}

function Block({ node }: Readonly<WithNode>) {
  const text = node === undefined ? "" : textOf(node);

  return <CodeBlock text={text.replace(/\n$/u, "")} />;
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

const COMPONENTS: Components = {
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
};

const PLUGINS = [remarkGfm];

export const PostText = memo(function PostText({ text }: Readonly<{ text: string }>) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => (root.current === null ? undefined : watchFades(root.current)), []);

  return (
    <div ref={root} className="md">
      <Markdown remarkPlugins={PLUGINS} components={COMPONENTS} urlTransform={safeUrl}>
        {text}
      </Markdown>
    </div>
  );
});
