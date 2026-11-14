import { chooseCandidateLink, shownLinkOf } from "./candidate-link.ts";
import { isPlainCodeDrop, isRemovedBody } from "./comment-filter.ts";
import { storedCommentId } from "./comment-id.ts";
import { type RedditRef, redditRefOf } from "./links.ts";
import {
  type Walked,
  checkedIds,
  checkedMetadata,
  checkedText,
  firstParentOf,
  graftAll,
  readAnswer,
  refusing,
  refuse,
  walk,
} from "./reddit-tree.ts";
import type { WireChild, WirePost } from "./reddit-wire.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { MAX_ROW_BYTES, type ThreadNode, rowFits } from "./thread-rows.ts";

export interface ParsedThread {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly postText: string | null;
  readonly postedAt: number | null;
  readonly reported: number | null;
  readonly linkedUrl: string | null;
  readonly postLink: string | null;
  readonly nodes: readonly ThreadNode[];
}

export type ThreadParse =
  | { readonly kind: "thread"; readonly thread: ParsedThread }
  | { readonly kind: "refused"; readonly reason: string };

function milliseconds(seconds: number): number {
  return Math.round(seconds * 1000);
}

function nodeOf(
  entry: Readonly<Walked>,
  position: number,
  place: Readonly<{ base: number; root: string }>,
): ThreadNode {
  const { comment, parent } = entry;
  const parentId = parent === place.root ? null : parent;
  const depth = entry.depth - place.base;

  if (comment === null) {
    return {
      id: `more_${String(position)}`,
      parentId,
      position,
      depth,
      kind: "more",
      author: null,
      body: null,
      score: null,
      postedAt: null,
      eligible: false,
    };
  }

  const eligible = !isPlainCodeDrop(comment.author, comment.body);

  return {
    id: storedCommentId(comment.id),
    parentId,
    position,
    depth,
    kind: "comment",
    author: comment.author,
    body: eligible ? comment.body : null,
    score: comment.score ?? null,
    postedAt: milliseconds(comment.created_utc),
    eligible,
  };
}

function nodesOf(entries: readonly Walked[], base: number, root: string): readonly ThreadNode[] {
  return entries.map((entry, position) => {
    const node = nodeOf(entry, position, { base, root });

    if (!rowFits(node)) {
      refuse(
        `the stored row of ${node.id} is longer than ${String(MAX_ROW_BYTES)} bytes once escaped`,
      );
    }

    return node;
  });
}

function postLinkOf(post: Readonly<WirePost>): string | null {
  if (post.is_self !== false) return null;

  const link = shownLinkOf(post.url ?? null);

  return link === null || redditRefOf(link)?.postId === post.id.toLowerCase() ? null : link;
}

function ofPost(post: Readonly<WirePost>, walked: readonly Walked[]): ParsedThread {
  const postText = isRemovedBody(post.selftext) ? null : post.selftext;

  return {
    title: post.title,
    author: post.author,
    community: post.subreddit,
    postText,
    postedAt: milliseconds(post.created_utc),
    reported: post.num_comments ?? null,
    linkedUrl: chooseCandidateLink({ url: post.url ?? null, text: postText }),
    postLink: postLinkOf(post),
    nodes: nodesOf(walked, 0, `t3_${post.id}`),
  };
}

function ofComment(
  post: Readonly<WirePost>,
  walked: readonly Walked[],
  requested: string,
): ParsedThread {
  const at = walked.findIndex((entry) => entry.comment?.id.toLowerCase() === requested);
  const root = walked[at];

  if (root?.comment === undefined || root.comment === null) {
    return refuse(`the requested comment ${requested} is not in the JSON`);
  }

  const { comment } = root;

  if (isRemovedBody(comment.body)) {
    return refuse(`the requested comment ${requested} is deleted or removed`);
  }

  const rest = walked.slice(at + 1);
  const end = rest.findIndex((entry) => entry.depth <= root.depth);

  return {
    title: post.title,
    author: comment.author,
    community: post.subreddit,
    postText: comment.body,
    postedAt: milliseconds(comment.created_utc),
    reported: null,
    linkedUrl: null,
    postLink: null,
    nodes: nodesOf(
      end === -1 ? rest : rest.slice(0, end),
      root.depth + 1,
      storedCommentId(comment.id),
    ),
  };
}

function boundaryOf(
  children: readonly WireChild[],
  post: Readonly<WirePost>,
  ref: Readonly<RedditRef>,
): string {
  return ref.commentId === undefined ? `t3_${post.id}` : firstParentOf(children);
}

function parseThread(answers: ThreadAnswers, ref: Readonly<RedditRef>): ParsedThread {
  const [content, ...later] = answers;
  const { post, children } = readAnswer(content, ref.postId);

  checkedMetadata({
    "the post title": post.title,
    "the post author": post.author,
    "the subreddit": post.subreddit,
  });
  checkedText(post.selftext, "the post text");

  const ids = new Set<string>();
  const first = walk(children, boundaryOf(children, post, ref));

  checkedIds(ids, first);

  const walked = graftAll(ids, first, later, ref.postId);

  return ref.commentId === undefined
    ? ofPost(post, walked)
    : ofComment(post, walked, ref.commentId.toLowerCase());
}

export function parseRedditThread(answers: ThreadAnswers, ref: Readonly<RedditRef>): ThreadParse {
  const read = refusing(() => parseThread(answers, ref));

  return read.kind === "read" ? { kind: "thread", thread: read.value } : read;
}
