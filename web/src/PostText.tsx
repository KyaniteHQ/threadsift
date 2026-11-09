import {
  type ComponentProps,
  type ReactNode,
  memo,
  use,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { readerUrl } from "../../src/core/reader-url.ts";
import { type HastNode, TEXT } from "../../src/core/text-projection.ts";
import { type CodePart, CodeBlock } from "./CodeBlock.tsx";
import { type MarkSpan, markPlugins } from "./highlight-marks.ts";
import { Mark } from "./Mark.tsx";
import { FOOTNOTES_LABEL, footnoteBackLabel, tableName } from "./reader-text.ts";
import { FootnoteScope, type Generated, Link, classed, scoped } from "./ReaderLink.tsx";
import { watchFades } from "./scroll-fades.ts";
import {
  NO_IMAGES,
  Picture,
  PictureScope,
  type SizedImages,
  usePictures,
} from "./StoredPicture.tsx";

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
  mark: Mark,
};

const PLUGINS = [remarkGfm];

const FOOTNOTES: NonNullable<ComponentProps<typeof Markdown>["remarkRehypeOptions"]> = {
  footnoteLabel: FOOTNOTES_LABEL,
  footnoteBackLabel,
  footnoteLabelProperties: { className: ["vh"] },
};

export const PostText = memo(function PostText({
  text,
  targetKey,
  spans,
  itemId = null,
  images = NO_IMAGES,
}: Readonly<{
  text: string;
  targetKey: string;
  spans: readonly MarkSpan[];
  itemId?: number | null;
  images?: SizedImages;
}>) {
  const root = useRef<HTMLDivElement>(null);
  const scope = useId();

  const pictures = usePictures(itemId, images);

  const options = useMemo(() => ({ ...FOOTNOTES, clobberPrefix: `${scope}-` }), [scope]);
  const rehype = useMemo(() => markPlugins(spans), [spans]);

  useEffect(() => (root.current === null ? undefined : watchFades(root.current)), []);

  return (
    <div ref={root} className="md" data-target={targetKey}>
      <FootnoteScope value={scope}>
        <PictureScope value={pictures}>
          <Markdown
            remarkPlugins={PLUGINS}
            rehypePlugins={rehype}
            remarkRehypeOptions={options}
            components={COMPONENTS}
            urlTransform={readerUrl}
          >
            {text}
          </Markdown>
        </PictureScope>
      </FootnoteScope>
    </div>
  );
});
