import { type RedditRef, redditRefOf } from "../../../core/contract/links.ts";
import {
  type Walked,
  checkedIds,
  firstParentOf,
  graftAll,
  readAnswer,
  walk,
} from "../../../core/contract/reddit-tree.ts";
import type { WirePost } from "../../../core/contract/reddit-wire.ts";
import type { ThreadAnswers } from "../../../core/contract/thread-answers.ts";
import { checkedMetadata, checkedText, refuse } from "../../../core/contract/thread-refusal.ts";
import { millisecondsFrom } from "../../../core/contract/time-units.ts";
import { isRemovedBody } from "../../thread/core/comment-filter.ts";
import {
  type NodeEntry,
  type ParsedThread,
  type ThreadParse,
  parsing,
  threadNodesOf,
} from "../../thread/core/thread-parse.ts";
import type { ThreadNode } from "../../thread/core/thread-rows.ts";
import { chooseCandidateLink, shownLinkOf } from "./candidate-link.ts";

function entryOf(
  entry: Readonly<Walked>,
  place: Readonly<{ base: number; rootId: string | null }>,
): NodeEntry {
  const { comment } = entry;
  const parentId = entry.parentId === place.rootId ? null : entry.parentId;
  const depth = entry.depth - place.base;

  if (comment === null) return { kind: "more", parentId, depth };

  return {
    kind: "comment",
    id: comment.id,
    parentId,
    depth,
    author: comment.author,
    body: comment.body,
    score: comment.score ?? null,
    postedAt: millisecondsFrom(comment.created_utc),
  };
}

function nodesOf(
  entries: readonly Walked[],
  base: number,
  rootId: string | null,
): readonly ThreadNode[] {
  return threadNodesOf(
    entries.map((entry) => entryOf(entry, { base, rootId })),
    (id) => id,
  );
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
    postedAt: millisecondsFrom(post.created_utc),
    reported: post.num_comments ?? null,
    linkedUrl: chooseCandidateLink({ url: post.url ?? null, text: postText }),
    postLink: postLinkOf(post),
    nodes: nodesOf(walked, 0, null),
  };
}

function ofComment(
  post: Readonly<WirePost>,
  walked: readonly Walked[],
  requested: string,
): ParsedThread {
  const at = walked.findIndex((entry) => entry.comment?.id === requested);
  const root = walked[at];

  if (root?.comment === undefined || root.comment === null) {
    return refuse(`the requested comment ${requested} is not in the JSON`);
  }

  const { comment } = root;

  if (isRemovedBody(comment.body)) {
    return refuse(`the requested comment ${requested} is deleted or removed`);
  }

  const rest = walked.slice(at + 1);
  const childDepth = root.depth + 1;
  const end = rest.findIndex(
    ({ depth, parentId }) =>
      depth < childDepth || (depth === childDepth && parentId !== comment.id),
  );

  return {
    title: post.title,
    author: comment.author,
    community: post.subreddit,
    postText: comment.body,
    postedAt: millisecondsFrom(comment.created_utc),
    reported: null,
    linkedUrl: null,
    postLink: null,
    nodes: nodesOf(end === -1 ? rest : rest.slice(0, end), childDepth, comment.id),
  };
}

export function checkedPost(post: Readonly<WirePost>): void {
  checkedMetadata({
    "the post title": post.title,
    "the post author": post.author,
    "the subreddit": post.subreddit,
  });
  checkedText(post.selftext, "the post text");
}

export function threadOf(
  post: Readonly<WirePost>,
  walked: readonly Walked[],
  ref: Readonly<RedditRef>,
): ParsedThread {
  return ref.commentId === undefined
    ? ofPost(post, walked)
    : ofComment(post, walked, ref.commentId.toLowerCase());
}

export function parseRedditThread(answers: ThreadAnswers, ref: Readonly<RedditRef>): ThreadParse {
  return parsing(() => {
    const [content, ...later] = answers;
    const { post, children } = readAnswer(content, ref.postId);

    checkedPost(post);

    const ids = new Set<string>();
    const first = walk(
      children,
      ref.commentId === undefined ? `t3_${post.id.toLowerCase()}` : firstParentOf(children),
      post.id,
    );

    checkedIds(ids, first);

    return threadOf(post, graftAll(ids, first, later, ref.postId), ref);
  });
}
