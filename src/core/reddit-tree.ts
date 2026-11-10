import { storedCommentId } from "./comment-id.ts";
import { utf8Length } from "./digest-prompt.ts";
import { INLINE_TEXT_BYTES } from "./post-text-files.ts";
import type { WireChild, WireComment } from "./reddit-wire.ts";

const METADATA_BYTES = 4096;

export class ThreadRefused extends Error {}

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
  readonly from: number;
}

function spotFor(into: readonly Walked[], root: Readonly<WireComment>): Spot {
  const listed = into.findIndex((entry) => entry.children.includes(root.id));

  if (listed !== -1) return { at: listed, from: 0 };

  const continued = into.findIndex(
    (entry) =>
      entry.comment === null &&
      entry.children.length === 0 &&
      entry.parent === storedCommentId(root.id),
  );

  return continued === -1
    ? refuse(`the answer for the comment ${root.id} fills no more stub`)
    : { at: continued, from: 1 };
}

export function graft(into: readonly Walked[], answer: readonly Walked[]): readonly Walked[] {
  const [first] = answer;

  if (first === undefined) return into;

  const roots = answer.filter(({ depth }) => depth === 0);

  if (first.comment === null || roots.length !== 1) {
    return refuse("an answer after the first holds exactly one comment at its top");
  }

  const rootId = first.comment.id;
  const { at, from } = spotFor(into, first.comment);
  const stub = into[at];

  if (stub === undefined || (from === 0 && first.parent !== stub.parent)) {
    return refuse(`the parent_id of the comment ${rootId} does not match its more stub`);
  }

  const placed = answer
    .slice(from)
    .map((entry) => Object.assign(entry, { depth: entry.depth - from + stub.depth }));

  const rest = stub.children.filter((id) => id !== rootId);
  const left = from === 0 && rest.length > 0 ? [{ ...stub, children: rest }] : [];

  return [...into.slice(0, at), ...placed, ...left, ...into.slice(at + 1)];
}

export function checkedIds(walked: readonly Walked[]): readonly Walked[] {
  const ids = new Set<string>();

  for (const { comment } of walked) {
    if (comment === null) continue;

    if (ids.has(comment.id)) {
      refuse(`the comment id ${comment.id} appears twice`);
    }

    ids.add(comment.id);
  }

  return walked;
}
