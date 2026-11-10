import { isPlainCodeDrop, isRemovedBody } from "./comment-filter.ts";
import { storedCommentId } from "./comment-id.ts";
import type { RedditRef } from "./links.ts";
import {
  ThreadRefused,
  type Walked,
  checkedIds,
  checkedMetadata,
  checkedText,
  graft,
  refuse,
  walk,
} from "./reddit-tree.ts";
import { type WireChild, type WirePost, ThreadJson } from "./reddit-wire.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { MAX_ROW_BYTES, type ThreadNode, rowFits } from "./thread-rows.ts";

export const THREAD_CONTENT_BYTES = 4 * 1024 * 1024;

export interface ParsedThread {
  readonly title: string;
  readonly author: string | null;
  readonly community: string | null;
  readonly postText: string | null;
  readonly postedAt: number | null;
  readonly reported: number | null;
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

function ofPost(post: Readonly<WirePost>, walked: readonly Walked[]): ParsedThread {
  return {
    title: post.title,
    author: post.author,
    community: post.subreddit,
    postText: isRemovedBody(post.selftext) ? null : post.selftext,
    postedAt: milliseconds(post.created_utc),
    reported: post.num_comments ?? null,
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
    nodes: nodesOf(
      end === -1 ? rest : rest.slice(0, end),
      root.depth + 1,
      storedCommentId(comment.id),
    ),
  };
}

function firstParentOf(children: readonly WireChild[]): string {
  return children[0]?.data.parent_id ?? "";
}

function boundaryOf(
  children: readonly WireChild[],
  post: Readonly<WirePost>,
  ref: Readonly<RedditRef>,
): string {
  return ref.commentId === undefined ? `t3_${post.id}` : firstParentOf(children);
}

interface Answer {
  readonly post: WirePost;
  readonly children: readonly WireChild[];
}

function readAnswer(content: string, ref: Readonly<RedditRef>): Answer {
  const parsed = ThreadJson.safeParse(JSON.parse(content));

  if (!parsed.success) {
    return refuse(
      "the JSON is not a Reddit thread: a post Listing, then a comment Listing whose comment ids are 1 to 29 letters or digits",
    );
  }

  const [posts, comments] = parsed.data;
  const [{ data: post }] = posts.data.children;

  if (post.id.toLowerCase() !== ref.postId.toLowerCase()) {
    return refuse(`the post id ${post.id} is not the id in the link`);
  }

  return { post, children: comments.data.children };
}

function parseThread(answers: ThreadAnswers, ref: Readonly<RedditRef>): ParsedThread {
  const [content, ...later] = answers;
  const { post, children } = readAnswer(content, ref);

  checkedMetadata({
    "the post title": post.title,
    "the post author": post.author,
    "the subreddit": post.subreddit,
  });
  checkedText(post.selftext, "the post text");

  const merged = later.reduce<readonly Walked[]>(
    (into, text) => {
      const answer = readAnswer(text, ref).children;

      return graft(into, walk(answer, firstParentOf(answer)));
    },
    walk(children, boundaryOf(children, post, ref)),
  );

  const walked = checkedIds(merged);

  return ref.commentId === undefined
    ? ofPost(post, walked)
    : ofComment(post, walked, ref.commentId.toLowerCase());
}

export function parseRedditThread(answers: ThreadAnswers, ref: Readonly<RedditRef>): ThreadParse {
  try {
    return { kind: "thread", thread: parseThread(answers, ref) };
  } catch (error) {
    if (error instanceof ThreadRefused) return { kind: "refused", reason: error.message };

    if (error instanceof SyntaxError || error instanceof RangeError) {
      return { kind: "refused", reason: "the content is not readable Reddit JSON" };
    }

    throw error;
  }
}
