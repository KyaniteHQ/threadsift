import { utf8Length } from "./ai-contract.ts";
import { isPlainCodeDrop, isRemovedBody } from "./comment-filter.ts";
import type { RedditRef } from "./links.ts";
import { INLINE_TEXT_BYTES } from "./post-text-files.ts";
import { type WireChild, type WireComment, type WirePost, ThreadJson } from "./reddit-wire.ts";
import { MAX_ROW_BYTES, type ThreadNode, rowFits } from "./thread-rows.ts";

export const THREAD_CONTENT_BYTES = 4 * 1024 * 1024;

export const METADATA_BYTES = 4096;

export interface ParsedThread {
  readonly title: string;
  readonly author: string;
  readonly community: string;
  readonly postText: string | null;
  readonly postedAt: number;
  readonly reported: number | null;
  readonly nodes: readonly ThreadNode[];
}

export type ThreadParse =
  | { readonly kind: "thread"; readonly thread: ParsedThread }
  | { readonly kind: "refused"; readonly reason: string };

class ThreadRefused extends Error {}

interface Walked {
  readonly comment: WireComment | null;
  readonly parent: string;
  readonly depth: number;
}

interface Pending {
  readonly child: WireChild;
  readonly parent: string;
  readonly depth: number;
}

function refuse(reason: string): never {
  throw new ThreadRefused(reason);
}

function milliseconds(seconds: number): number {
  return Math.round(seconds * 1000);
}

function checkedText(text: string, what: string): void {
  if (utf8Length(text) > INLINE_TEXT_BYTES) {
    refuse(`${what} is longer than ${String(INLINE_TEXT_BYTES)} bytes`);
  }
}

function checkedMetadata(fields: Readonly<Record<string, string>>): void {
  for (const [what, text] of Object.entries(fields)) {
    if (utf8Length(text) > METADATA_BYTES) {
      refuse(`${what} is longer than ${String(METADATA_BYTES)} bytes`);
    }
  }
}

function repliesOf({ replies }: Readonly<WireComment>): readonly WireChild[] {
  return replies === undefined || replies === "" ? [] : replies.data.children;
}

function pendingOf(children: readonly WireChild[], parent: string, depth: number): Pending[] {
  return children.map((child) => ({ child, parent, depth })).toReversed();
}

function walk(children: readonly WireChild[], root: string): readonly Walked[] {
  const walked: Walked[] = [];
  const ids = new Set<string>();
  const stack = pendingOf(children, root, 0);

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { child, parent, depth } = next;

    if (child.data.parent_id !== parent) {
      refuse(`a parent_id does not match the tree under ${parent}`);
    }

    if (child.kind === "more") {
      walked.push({ comment: null, parent, depth });
      continue;
    }

    const { data } = child;

    if (ids.has(data.id)) {
      refuse(`the comment id ${data.id} appears twice`);
    }

    ids.add(data.id);
    checkedMetadata({
      [`the id of comment ${data.id}`]: data.id,
      [`the author of comment ${data.id}`]: data.author,
      [`the parent_id of comment ${data.id}`]: data.parent_id,
    });
    checkedText(data.body, `the body of comment ${data.id}`);
    walked.push({ comment: data, parent, depth });

    for (const reply of pendingOf(repliesOf(data), `t1_${data.id}`, depth + 1)) {
      stack.push(reply);
    }
  }

  return walked;
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
    id: `t1_${comment.id}`,
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
    nodes: nodesOf(end === -1 ? rest : rest.slice(0, end), root.depth + 1, `t1_${comment.id}`),
  };
}

function boundaryOf(
  children: readonly WireChild[],
  post: Readonly<WirePost>,
  ref: Readonly<RedditRef>,
): string {
  return ref.commentId === undefined ? `t3_${post.id}` : (children[0]?.data.parent_id ?? "");
}

function parseThread(content: string, ref: Readonly<RedditRef>): ParsedThread {
  const parsed = ThreadJson.safeParse(JSON.parse(content));

  if (!parsed.success) {
    return refuse("the JSON is not a Reddit thread: a post Listing, then a comment Listing");
  }

  const [posts, comments] = parsed.data;
  const [{ data: post }] = posts.data.children;

  if (post.id.toLowerCase() !== ref.postId.toLowerCase()) {
    return refuse(`the post id ${post.id} is not the id in the link`);
  }

  checkedMetadata({
    "the post title": post.title,
    "the post author": post.author,
    "the subreddit": post.subreddit,
  });
  checkedText(post.selftext, "the post text");

  const walked = walk(comments.data.children, boundaryOf(comments.data.children, post, ref));

  return ref.commentId === undefined
    ? ofPost(post, walked)
    : ofComment(post, walked, ref.commentId.toLowerCase());
}

export function parseRedditThread(content: string, ref: Readonly<RedditRef>): ThreadParse {
  try {
    return { kind: "thread", thread: parseThread(content, ref) };
  } catch (error) {
    if (error instanceof ThreadRefused) return { kind: "refused", reason: error.message };

    if (error instanceof SyntaxError || error instanceof RangeError) {
      return { kind: "refused", reason: "the content is not readable Reddit JSON" };
    }

    throw error;
  }
}
