import { type CSSProperties, type FocusEvent, useCallback, useEffect, useId, useRef } from "react";

import type { CommentNode } from "../../src/core/contract/comment-view.ts";
import type { ItemDetail } from "../../src/core/contract/item-detail-wire.ts";
import type { Item } from "../../src/core/contract/item-wire.ts";
import {
  COMMENTS_TITLE,
  CONTEXT_LABEL,
  STUB_TEXTS,
  handleOf,
} from "../../src/core/contract/reader-text.ts";
import { useCommentFold } from "./comment-fold.ts";
import { type Branch, nest } from "./comment-nesting.ts";
import { useOpenOnReveal } from "./highlights-context.ts";
import { PlaceLink } from "./PlaceLink.tsx";
import { PostTextView } from "./post-text-module.ts";
import { type CommentsSection, commentsSectionOf } from "./reader-sections.ts";
import {
  OP_LABEL,
  SHOW_FULL_COMMENT,
  SHOW_LESS,
  countLabel,
  isSameHandle,
  scoreLabel,
} from "./reader-text.ts";

function depthStyle(depth: number): CSSProperties {
  return Object.fromEntries([["--d", depth]]);
}

function initialOf(author: string | null): string {
  return (author ?? "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .charAt(0)
    .toUpperCase();
}

type Comment = Extract<CommentNode, { kind: "comment" }>;

function useOpenFold(commentId: string) {
  const more = useRef<HTMLButtonElement>(null);
  const fromTop = useRef(false);
  const [open, setOpen] = useOpenOnReveal(({ key }) => key === commentId);

  const toggle = useCallback(() => {
    setOpen((now) => !now);
  }, [setOpen]);

  const lessFromTop = useCallback(() => {
    fromTop.current = true;
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (!open && fromTop.current) {
      fromTop.current = false;
      more.current?.focus({ preventScroll: true });
    }
  }, [open]);

  const reveal = useCallback(
    (event: Readonly<Pick<FocusEvent<HTMLElement>, "target">>) => {
      if (event.target.matches(":focus-visible")) setOpen(true);
    },
    [setOpen],
  );

  return { more, open, toggle, lessFromTop, reveal };
}

function CommentText({ comment }: Readonly<{ comment: Comment }>) {
  const box = useRef<HTMLDivElement>(null);
  const { more, open, toggle, lessFromTop, reveal } = useOpenFold(comment.id);
  const fold = useCommentFold(box);
  const bodyId = useId();

  return (
    <>
      {fold === "long" && open ? (
        <button
          type="button"
          className="btn btn-plain cm-more cm-more-top"
          aria-expanded="true"
          aria-controls={bodyId}
          onClick={lessFromTop}
        >
          {SHOW_LESS}
        </button>
      ) : null}
      <div
        ref={box}
        id={bodyId}
        className={fold !== "none" && !open ? "cm-fold folded" : "cm-fold"}
        onFocus={fold === "none" ? undefined : reveal}
      >
        <PostTextView text={comment.body} targetKey={comment.id} />
      </div>
      {fold === "none" ? null : (
        <button
          ref={more}
          type="button"
          className="btn btn-plain cm-more"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {open ? SHOW_LESS : SHOW_FULL_COMMENT}
        </button>
      )}
    </>
  );
}

function KeptComment({
  comment,
  source,
  op,
}: Readonly<{ comment: Comment; source: Item["source"]; op: boolean }>) {
  return (
    <div className="cm-card">
      <p className="cm-head">
        <span className="cm-av" aria-hidden="true">
          {initialOf(comment.author)}
        </span>
        <span className="cm-author">{handleOf(source, comment.author)}</span>
        {op ? <span className="op">{OP_LABEL}</span> : null}
        <span>{comment.score === null ? "" : scoreLabel(comment.score, source)}</span>
      </p>
      <CommentText comment={comment} />
    </div>
  );
}

function Stub({ kind }: Readonly<{ kind: keyof typeof STUB_TEXTS }>) {
  const text = STUB_TEXTS[kind];

  return (
    <div className="cm-stub">
      <span className="cm-av" aria-hidden="true" />
      {kind === "more" ? null : <span className="cm-ctx">{CONTEXT_LABEL}</span>}
      <span className="cm-prev" title={text}>
        {text}
      </span>
    </div>
  );
}

function Node({
  node,
  source,
  op,
}: Readonly<{ node: CommentNode; source: Item["source"]; op: boolean }>) {
  switch (node.kind) {
    case "comment":
      return <KeptComment comment={node} source={source} op={op} />;
    case "stub":
      return <Stub kind={node.reason} />;
    case "more":
      return <Stub kind="more" />;
    default: {
      const exhaustive: never = node;

      return exhaustive;
    }
  }
}

function classesOf(node: Readonly<CommentNode>, first: boolean): string {
  return [
    "cm",
    ...(node.depth === 0 && !first ? ["top"] : []),
    ...(node.depth > 2 ? ["deep"] : []),
  ].join(" ");
}

function Branches({
  branches,
  owner,
  first,
}: Readonly<{
  branches: readonly Branch[];
  owner: Readonly<Pick<Item, "author" | "source">>;
  first: boolean;
}>) {
  return (
    <ol role="list" className="tree">
      {branches.map(({ node, replies }, index) => (
        <li
          key={node.id}
          className={classesOf(node, first && index === 0)}
          style={depthStyle(node.depth)}
        >
          <div className="cm-row">
            <Node
              node={node}
              source={owner.source}
              op={node.kind === "comment" && isSameHandle(node.author, owner.author)}
            />
          </div>
          {replies.length === 0 ? null : (
            <Branches branches={replies} owner={owner} first={false} />
          )}
        </li>
      ))}
    </ol>
  );
}

function CommentTree({
  item,
  section: { counts, note, needsProvider },
  nodes,
  id,
}: Readonly<{ item: Item; section: CommentsSection; nodes: readonly CommentNode[]; id: string }>) {
  const branches = nest(nodes);

  return (
    <section id={id} className="rd-comments">
      <div className="rd-sec-h">
        <h3 className="rd-h" tabIndex={-1}>
          {COMMENTS_TITLE}
        </h3>
        {counts === null ? null : <p className="rd-count">{countLabel(counts, "heading")}</p>}
      </div>
      {note === null ? null : <p className="rd-note">{note}</p>}
      {needsProvider ? <PlaceLink to="ai-settings" /> : null}
      {branches.length === 0 ? null : <Branches branches={branches} owner={item} first />}
    </section>
  );
}

export function drawsCommentText(comments: Readonly<ItemDetail["comments"]>): boolean {
  return (
    commentsSectionOf(comments.view) !== null &&
    comments.nodes.some((node) => node.kind === "comment")
  );
}

export function Comments({
  item,
  detail,
  id,
}: Readonly<{ item: Item; detail: ItemDetail; id: string }>) {
  const section = commentsSectionOf(detail.comments.view);

  return section === null ? null : (
    <CommentTree item={item} section={section} nodes={detail.comments.nodes} id={id} />
  );
}
