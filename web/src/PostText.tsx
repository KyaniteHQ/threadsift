import {
  type ComponentProps,
  type ReactNode,
  createContext,
  memo,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { z } from "zod";

import { FOOTNOTE_LABEL_ID, readerUrl } from "../../src/core/reader-url.ts";
import { CodeBlock } from "./CodeBlock.tsx";
import { FOOTNOTES_LABEL, FOOTNOTE_BACK, FOOTNOTE_BACK_AGAIN, tableName } from "./reader-text.ts";
import { watchFades } from "./scroll-fades.ts";
import { filled } from "./text.ts";

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

const FootnoteScope = createContext("");

function scoped(scope: string, id: string | undefined): string | undefined {
  return id === FOOTNOTE_LABEL_ID ? `${scope}-${id}` : id;
}

interface Generated {
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

function classed(base: string, extra: string | undefined): string {
  return extra === undefined ? base : `${base} ${extra}`;
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

interface LinkAttributes extends Generated {
  readonly href?: string | undefined;
  readonly "aria-label"?: string | undefined;
  readonly "aria-describedby"?: string | undefined;
  readonly "data-footnote-ref"?: string | undefined;
  readonly "data-footnote-backref"?: string | undefined;
}

function Link({
  href,
  id,
  className,
  children,
  "aria-label": label,
  "aria-describedby": describedBy,
  "data-footnote-ref": footnoteRef,
  "data-footnote-backref": footnoteBackref,
}: Readonly<LinkAttributes>) {
  const scope = use(FootnoteScope);

  if (href === undefined || href === "") return <span>{children}</span>;

  const inside = href.startsWith("#");

  return (
    <a
      id={id}
      className={classed("il-a", className)}
      href={href}
      target={inside ? undefined : "_blank"}
      rel={inside ? undefined : "noopener noreferrer"}
      aria-label={label}
      aria-describedby={scoped(scope, describedBy)}
      data-footnote-ref={footnoteRef}
      data-footnote-backref={footnoteBackref}
    >
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

  const code = text.replace(/\n$/u, "");

  return <CodeBlock key={code} text={code} />;
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

function footnoteBackLabel(referenceIndex: number, rereferenceIndex: number): string {
  const values = {
    reference: String(referenceIndex + 1),
    again: String(rereferenceIndex),
  };

  return filled(rereferenceIndex > 1 ? FOOTNOTE_BACK_AGAIN : FOOTNOTE_BACK, values);
}

const FOOTNOTES: NonNullable<ComponentProps<typeof Markdown>["remarkRehypeOptions"]> = {
  footnoteLabel: FOOTNOTES_LABEL,
  footnoteBackLabel,
  footnoteLabelProperties: { className: ["vh"] },
};

export const PostText = memo(function PostText({ text }: Readonly<{ text: string }>) {
  const root = useRef<HTMLDivElement>(null);
  const scope = useId();
  const options = useMemo(() => ({ ...FOOTNOTES, clobberPrefix: `${scope}-` }), [scope]);

  useEffect(() => (root.current === null ? undefined : watchFades(root.current)), []);

  return (
    <div ref={root} className="md">
      <FootnoteScope value={scope}>
        <Markdown
          remarkPlugins={PLUGINS}
          remarkRehypeOptions={options}
          components={COMPONENTS}
          urlTransform={readerUrl}
        >
          {text}
        </Markdown>
      </FootnoteScope>
    </div>
  );
});
