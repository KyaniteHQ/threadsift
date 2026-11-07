import { z } from "zod";

import { utf8Length } from "./ai-contract.ts";
import { isPlainCodeDrop, isRemovedBody } from "./comment-filter.ts";
import type { RedditRef } from "./links.ts";
import { INLINE_TEXT_BYTES } from "./post-text-files.ts";

export const THREAD_CONTENT_BYTES = 4 * 1024 * 1024;

interface WireComment {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly parent_id: string;
  readonly score?: number | null | undefined;
  readonly created_utc: number;
  readonly replies?: "" | WireListing | undefined;
}

interface WireListing {
  readonly data: { readonly children: readonly WireChild[] };
}

type WireChild =
  | { readonly kind: "t1"; readonly data: WireComment }
  | { readonly kind: "more"; readonly data: { readonly parent_id: string } };

const Child: z.ZodType<WireChild> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("t1"), data: CommentData }),
    z.object({ kind: z.literal("more"), data: z.object({ parent_id: z.string() }) }),
  ]),
);

const Listing = z.object({ data: z.object({ children: z.array(Child) }) });

const CommentData = z.object({
  id: z.string().min(1),
  author: z.string(),
  body: z.string(),
  parent_id: z.string(),
  score: z.number().int().nullish(),
  created_utc: z.number().nonnegative(),
  replies: z.union([z.literal(""), Listing]).optional(),
});

const PostData = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    author: z.string(),
    subreddit: z.string().min(1),
    selftext: z.string(),
    created_utc: z.number().nonnegative(),
    num_comments: z.number().int().nonnegative().nullish(),
  })
  .readonly();

const PostListing = z
  .object({
    data: z
      .object({
        children: z
          .tuple([z.object({ kind: z.literal("t3"), data: PostData }).readonly()])
          .readonly(),
      })
      .readonly(),
  })
  .readonly();

const ThreadJson = z.tuple([PostListing, Listing]);

type Post = z.infer<typeof PostData>;

export interface ThreadNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly depth: number;
  readonly kind: "comment" | "more";
  readonly author: string | null;
  readonly body: string | null;
  readonly score: number | null;
  readonly postedAt: number | null;
  readonly eligible: boolean;
}

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

const QUOTES = 2;

function checkedText(text: string, what: string): string {
  if (utf8Length(JSON.stringify(text)) - QUOTES > INLINE_TEXT_BYTES) {
    refuse(`${what} is longer than ${String(INLINE_TEXT_BYTES)} bytes`);
  }

  return text;
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
  return entries.map((entry, position) => nodeOf(entry, position, { base, root }));
}

function ofPost(post: Readonly<Post>, walked: readonly Walked[]): ParsedThread {
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
  post: Readonly<Post>,
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

  checkedText(post.selftext, "the post text");
  const walked = walk(comments.data.children, `t3_${post.id}`);

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
