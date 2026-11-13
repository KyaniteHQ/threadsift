import { storedCommentId, wireCommentId } from "./comment-id.ts";
import { utf8Length } from "./digest-prompt.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";
import { type WireChild, type WireComment, type WirePost, ThreadJson } from "./reddit-wire.ts";

const METADATA_BYTES = 4096;

class ThreadRefused extends Error {}

export interface Walked {
  readonly comment: WireComment | null;
  readonly children: readonly string[];
  readonly parent: string;
  readonly depth: number;
}

interface Pending {
  readonly child: WireChild;
  readonly parent: string;
  readonly depth: number;
}

export function refuse(reason: string): never {
  throw new ThreadRefused(reason);
}

export function checkedText(text: string, what: string): void {
  if (utf8Length(text) > INLINE_TEXT_BYTES) {
    refuse(`${what} is longer than ${String(INLINE_TEXT_BYTES)} bytes`);
  }
}

export function checkedMetadata(fields: Readonly<Record<string, string>>): void {
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

export function walk(children: readonly WireChild[], root: string): readonly Walked[] {
  const walked: Walked[] = [];
  const stack = pendingOf(children, root, 0);

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const { child, parent, depth } = next;

    if (child.data.parent_id !== parent) {
      refuse(`a parent_id does not match the tree under ${parent}`);
    }

    if (child.kind === "more") {
      walked.push({ comment: null, children: child.data.children, parent, depth });
      continue;
    }

    const { data } = child;

    checkedMetadata({
      [`the id of comment ${data.id}`]: data.id,
      [`the author of comment ${data.id}`]: data.author,
      [`the parent_id of comment ${data.id}`]: data.parent_id,
    });
    checkedText(data.body, `the body of comment ${data.id}`);
    walked.push({ comment: data, children: [], parent, depth });

    for (const reply of pendingOf(repliesOf(data), storedCommentId(data.id), depth + 1)) {
      stack.push(reply);
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
    (entry) =>
      entry.comment === null &&
      entry.children.length === 0 &&
      entry.parent === storedCommentId(root.id),
  );

  return continued === -1
    ? refuse(`the answer for the comment ${root.id} fills no more stub`)
    : { at: continued, continued: true };
}

export function graft(
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

  if (stub === undefined || (!continued && first.parent !== stub.parent)) {
    return refuse(`the parent_id of the comment ${rootId} does not match its more stub`);
  }

  const lifted = continued ? 1 : 0;

  const placed = answer.slice(lifted).map(({ comment, children, parent, depth }) => ({
    comment,
    children,
    parent,
    depth: depth - lifted + stub.depth,
  }));

  checkedIds(ids, placed);

  const rest = stub.children.filter((id) => id !== rootId);
  const left = !continued && rest.length > 0 ? [{ ...stub, children: rest }] : [];

  return [...into.slice(0, at), ...placed, ...left, ...into.slice(at + 1)];
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

export interface Answer {
  readonly post: WirePost;
  readonly children: readonly WireChild[];
}

export function readAnswer(content: string, postId: string): Answer {
  const parsed = ThreadJson.safeParse(JSON.parse(content));

  if (!parsed.success) {
    return refuse(
      "the JSON is not a Reddit thread: a post Listing, then a comment Listing whose comment ids are 1 to 29 letters or digits",
    );
  }

  const [posts, comments] = parsed.data;
  const [{ data: post }] = posts.data.children;

  if (post.id.toLowerCase() !== postId.toLowerCase()) {
    return refuse(`the post id ${post.id} is not the id in the link`);
  }

  return { post, children: comments.data.children };
}

export function firstParentOf(children: readonly WireChild[]): string {
  return children[0]?.data.parent_id ?? "";
}

type Read<Value> =
  | { readonly kind: "read"; readonly value: Value }
  | { readonly kind: "refused"; readonly reason: string };

export function refusing<Value>(read: () => Value): Read<Value> {
  try {
    return { kind: "read", value: read() };
  } catch (error) {
    if (error instanceof ThreadRefused) return { kind: "refused", reason: error.message };

    if (error instanceof SyntaxError || error instanceof RangeError) {
      return { kind: "refused", reason: "the content is not readable Reddit JSON" };
    }

    throw error;
  }
}

function hiddenIdsOf(walked: readonly Walked[]): readonly string[] {
  return walked.flatMap(({ comment, children, parent }) => {
    if (comment !== null) return [];

    return children.length > 0 ? children : (wireCommentId(parent) ?? []);
  });
}

export function hiddenRepliesOf(content: string, postId: string): readonly string[] | null {
  const read = refusing(() => {
    const { children } = readAnswer(content, postId);

    return hiddenIdsOf(walk(children, firstParentOf(children)));
  });

  return read.kind === "read" ? read.value : null;
}
