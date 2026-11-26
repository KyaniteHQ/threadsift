import { COMMENT_ID_MAX, CommentId, commentFullname, idOfCommentFullname } from "./comment-id.ts";
import { type WireChild, type WireComment, type WirePost, ThreadJson } from "./reddit-wire.ts";
import type { ThreadAnswers } from "./thread-answers.ts";
import { checkedMetadata, checkedText, refuse, refusing } from "./thread-refusal.ts";

const NOT_READABLE = "the content is not readable Reddit JSON";

export interface Walked {
  readonly comment: WireComment | null;
  readonly children: readonly string[];
  readonly parentId: string | null;
  readonly depth: number;
}

interface Pending {
  readonly child: WireChild;
  readonly parentId: string | null;
  readonly depth: number;
}

function parentIdOf(fullname: string, postId: string): string | null {
  if (fullname.toLowerCase() === `t3_${postId.toLowerCase()}`) return null;

  return (
    idOfCommentFullname(fullname) ??
    refuse(`the parent_id ${fullname} names neither the post nor a comment`)
  );
}

function repliesOf({ replies }: Readonly<WireComment>): readonly WireChild[] {
  return replies === undefined || replies === "" ? [] : replies.data.children;
}

function pendingOf(
  children: readonly WireChild[],
  parent: Readonly<{ fullname: string; id: string | null }>,
  depth: number,
): Pending[] {
  return children.map((child) => {
    if (child.data.parent_id !== parent.fullname) {
      refuse(`a parent_id does not match the tree under ${parent.fullname}`);
    }

    return { child, parentId: parent.id, depth };
  });
}

function walkPending(roots: readonly Pending[]): readonly Walked[] {
  const walked: Walked[] = [];
  const stack = roots.toReversed();

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { child, parentId, depth } = next;

    if (child.kind === "more") {
      walked.push({ comment: null, children: child.data.children, parentId, depth });
      continue;
    }

    const { data } = child;

    checkedMetadata({
      [`the id of comment ${data.id}`]: data.id,
      [`the author of comment ${data.id}`]: data.author,
      [`the parent_id of comment ${data.id}`]: data.parent_id,
    });
    checkedText(data.body, `the body of comment ${data.id}`);
    walked.push({ comment: data, children: [], parentId, depth });

    for (const reply of pendingOf(
      repliesOf(data),
      { fullname: commentFullname(data.id), id: data.id },
      depth + 1,
    ).toReversed()) {
      stack.push(reply);
    }
  }

  return walked;
}

export function walk(
  children: readonly WireChild[],
  root: string,
  postId: string,
): readonly Walked[] {
  if (children.length === 0) return [];

  return walkPending(pendingOf(children, { fullname: root, id: parentIdOf(root, postId) }, 0));
}

export function walkArchive(children: readonly WireChild[], postId: string): readonly Walked[] {
  const root = { fullname: `t3_${postId}`, id: null };
  const branches: Pending[][] = [];
  const missing = new Map<string, Pending[]>();

  for (const child of children) {
    if (child.kind === "more" || child.data.parent_id === root.fullname) {
      branches.push(pendingOf([child], root, 0));
      continue;
    }

    const parent = child.data.parent_id.toLowerCase();
    const reply = { child, parentId: idOfCommentFullname(parent), depth: 1 };
    const siblings = missing.get(parent);

    if (siblings === undefined) {
      const branch = [reply];

      missing.set(parent, branch);
      branches.push(branch);
    } else {
      siblings.push(reply);
    }
  }

  const walked = walkPending(branches.flat());
  const present = new Set(
    walked.flatMap(({ comment }) => (comment === null ? [] : [comment.id.toLowerCase()])),
  );

  for (const parent of missing.keys()) {
    const id = CommentId.safeParse(idOfCommentFullname(parent));

    if (!id.success || present.has(id.data)) {
      refuse(`the archive tree has an unexpected top-level parent_id ${parent}`);
    }
  }

  return walked;
}

interface Spot {
  readonly at: number;
  readonly continued: boolean;
}

function spotFor(into: readonly Walked[], root: Readonly<WireComment>): Spot {
  const listed = into.findIndex((entry) => entry.children.includes(root.id));

  if (listed !== -1) return { at: listed, continued: false };

  const continued = into.findIndex(
    (entry) => entry.comment === null && entry.children.length === 0 && entry.parentId === root.id,
  );

  return continued === -1
    ? refuse(`the answer for the comment ${root.id} fills no more stub`)
    : { at: continued, continued: true };
}

function graft(
  ids: Readonly<Set<string>>,
  into: readonly Walked[],
  answer: readonly Walked[],
): readonly Walked[] {
  const [first] = answer;

  if (first === undefined) return into;

  const roots = answer.filter(({ depth }) => depth === 0);

  if (first.comment === null || roots.length !== 1) {
    return refuse("an answer after the first holds exactly one comment at its top");
  }

  const rootId = first.comment.id;
  const { at, continued } = spotFor(into, first.comment);
  const stub = into[at];

  if (stub === undefined || (!continued && first.parentId !== stub.parentId)) {
    return refuse(`the parent_id of the comment ${rootId} does not match its more stub`);
  }

  const lifted = continued ? 1 : 0;

  const placed = answer.slice(lifted).map(({ comment, children, parentId, depth }) => ({
    comment,
    children,
    parentId,
    depth: depth - lifted + stub.depth,
  }));

  checkedIds(ids, placed);

  const rest = stub.children.filter((id) => id !== rootId);
  const left = !continued && rest.length > 0 ? [{ ...stub, children: rest }] : [];

  return [...into.slice(0, at), ...placed, ...left, ...into.slice(at + 1)];
}

export function graftAll(
  ids: Readonly<Set<string>>,
  first: readonly Walked[],
  later: readonly string[],
  postId: string,
): readonly Walked[] {
  return later.reduce<readonly Walked[]>((into, text) => {
    const answer = readAnswer(text, postId).children;

    return graft(ids, into, walk(answer, firstParentOf(answer), postId));
  }, first);
}

export function checkedIds(ids: Readonly<Set<string>>, walked: readonly Walked[]): void {
  for (const { comment } of walked) {
    if (comment === null) continue;

    if (ids.has(comment.id)) {
      refuse(`the comment id ${comment.id} appears twice`);
    }

    ids.add(comment.id);
  }
}

interface Answer {
  readonly post: WirePost;
  readonly children: readonly WireChild[];
}

function parsedAnswer(content: string) {
  try {
    return ThreadJson.safeParse(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return refuse(NOT_READABLE);

    throw error;
  }
}

export function redditAnswerOf(
  post: WirePost,
  children: readonly WireChild[],
  postId: string,
): Answer {
  if (post.id.toLowerCase() !== postId.toLowerCase()) {
    return refuse(`the post id ${post.id} is not the id in the link`);
  }

  return { post, children };
}

export function readAnswer(content: string, postId: string): Answer {
  const parsed = parsedAnswer(content);

  if (!parsed.success) {
    return refuse(
      `the JSON is not a Reddit thread: a post Listing, then a comment Listing whose comment ids are 1 to ${String(COMMENT_ID_MAX)} letters or digits`,
    );
  }

  const [posts, comments] = parsed.data;
  const [{ data: post }] = posts.data.children;

  return redditAnswerOf(post, comments.data.children, postId);
}

export function firstParentOf(children: readonly WireChild[]): string {
  return children[0]?.data.parent_id ?? "";
}

function hiddenIdsOf(walked: readonly Walked[]): readonly string[] {
  return walked.flatMap(({ comment, children, parentId }) => {
    if (comment !== null) return [];

    return children.length > 0 ? children : (parentId ?? []);
  });
}

export function hiddenRepliesOf(content: string, postId: string): readonly string[] | null {
  const read = refusing(() => {
    const { children } = readAnswer(content, postId);

    return hiddenIdsOf(walk(children, firstParentOf(children), postId));
  });

  return read.kind === "read" ? read.value : null;
}

export function unfilledStubsOf(answers: ThreadAnswers, postId: string): number | null {
  const [content, ...later] = answers;

  const read = refusing(() => {
    const { children } = readAnswer(content, postId);
    const ids = new Set<string>();
    const first = walk(children, firstParentOf(children), postId);

    checkedIds(ids, first);

    return graftAll(ids, first, later, postId).filter(({ comment }) => comment === null).length;
  });

  return read.kind === "read" ? read.value : null;
}
