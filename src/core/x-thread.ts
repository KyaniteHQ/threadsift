import { storedCommentId, wireCommentId } from "./comment-id.ts";
import { utf8Length } from "./encoding.ts";
import type { StoredParse } from "./stored-thread.ts";
import {
  type NodeEntry,
  type ParsedThread,
  type ThreadParse,
  parsing,
  threadNodesOf,
} from "./thread-parse.ts";
import { type ThreadRefusal, checkedMetadata, checkedText, refuse } from "./thread-refusal.ts";
import { MAX_ROW_BYTES } from "./thread-rows.ts";
import { type JoinedPost, joinedPost, postTitle } from "./x-joined-post.ts";
import { order } from "./x-reply-order.ts";
import { type XReply, type XThreadValue, XBotThreadSchema, XThreadSchema } from "./x-wire.ts";
import { fieldNamesOf, issueCodesOf } from "./zod-reasons.ts";

const NOT_READABLE = "the content is not readable JSON";

interface Placed {
  readonly reply: XReply;
  readonly parentId: string | null;
  readonly depth: number;
}

function checkedReplies(postId: string, replies: readonly XReply[]): void {
  const ids = new Set<string>([postId]);

  for (const { id, parentId, author, text } of replies) {
    if (id === postId) refuse(`the reply ${id} has the id of the post`);

    if (ids.has(id)) refuse(`the reply id ${id} appears twice`);

    ids.add(id);
    checkedMetadata({
      [`the id of reply ${id}`]: id,
      [`the author of reply ${id}`]: author,
      [`the parentId of reply ${id}`]: parentId,
    });
    checkedText(text, `the text of reply ${id}`);
  }
}

function checkedQuoted({ id, quoted }: XThreadValue["post"], replies: readonly XReply[]) {
  const ids = new Set<string>([id, ...replies.map((reply) => reply.id)]);
  let above = BigInt(id);

  for (const quote of quoted) {
    if (ids.has(quote.id)) {
      refuse(`the quoted post ${quote.id} has the id of the post, a reply or another quoted post`);
    }

    if (BigInt(quote.id) > above) {
      refuse(`the quoted post ${quote.id} is not older than the post that quotes it`);
    }

    ids.add(quote.id);
    above = BigInt(quote.id);
    checkedMetadata({ [`the author of quoted post ${quote.id}`]: quote.author });
    checkedText(quote.text, `the text of quoted post ${quote.id}`);
  }
}

function timeOf({ postedAt }: Readonly<XReply>): number {
  return postedAt ?? Number.POSITIVE_INFINITY;
}

function replyBefore(first: Readonly<XReply>, second: Readonly<XReply>): number {
  return order(timeOf(first), timeOf(second)) || order(BigInt(first.id), BigInt(second.id));
}

function childrenByParent(replies: readonly XReply[]): ReadonlyMap<string, readonly XReply[]> {
  const children = new Map<string, XReply[]>();

  for (const reply of replies.toSorted(replyBefore)) {
    const siblings = children.get(reply.parentId) ?? [];

    siblings.push(reply);
    children.set(reply.parentId, siblings);
  }

  return children;
}

function placed(
  children: readonly XReply[] | undefined,
  parentId: string | null,
  depth: number,
): Placed[] {
  return (children ?? []).map((reply) => ({ reply, parentId, depth })).toReversed();
}

function walk(postId: string, replies: readonly XReply[]): readonly Placed[] {
  const children = childrenByParent(replies);
  const walked: Placed[] = [];
  const known = new Set([postId, ...replies.map(({ id }) => id)]);
  const stack = [...children]
    .filter(([parent]) => !known.has(parent))
    .toReversed()
    .flatMap(([parent, siblings]) => placed(siblings, storedCommentId(parent), 1));

  stack.push(...placed(children.get(postId), null, 0));

  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    walked.push(next);

    stack.push(
      ...placed(children.get(next.reply.id), storedCommentId(next.reply.id), next.depth + 1),
    );
  }

  if (walked.length !== replies.length) {
    refuse("the parentId of some replies forms a cycle that never reaches the post");
  }

  return walked;
}

function replyNamed(id: string): string {
  return `reply ${wireCommentId(id) ?? id}`;
}

function entryOf({ reply, parentId, depth }: Readonly<Placed>): NodeEntry {
  return {
    kind: "comment",
    id: storedCommentId(reply.id),
    parentId,
    depth,
    author: reply.author,
    body: reply.text,
    score: reply.likes,
    postedAt: reply.postedAt,
  };
}

function entriesOf(walked: readonly Placed[], reported: number | null): readonly NodeEntry[] {
  const entries = walked.map((step) => entryOf(step));
  const missing = reported === null ? entries.length > 0 : reported > entries.length;

  return missing ? [...entries, { kind: "more", parentId: null, depth: 0 }] : entries;
}

function parseThread(value: XThreadValue, statusId: string): ParsedThread {
  const { post, replies } = value;

  if (post.id !== statusId) refuse(`the post id ${post.id} is not the status id in the link`);

  checkedMetadata({ "the post author": post.author });
  checkedText(post.text, "the post text");
  checkedReplies(post.id, replies);
  checkedQuoted(post, replies);

  const nodes = threadNodesOf(entriesOf(walk(post.id, replies), post.replies), replyNamed);

  return {
    title: postTitle(post.text, post.author),
    author: post.author,
    community: null,
    postText: post.text,
    postedAt: post.postedAt,
    reported: post.replies,
    linkedUrl: null,
    postLink: null,
    nodes,
  };
}

export function storedXThread(
  thread: XThreadValue,
): { readonly kind: "thread"; readonly thread: XThreadValue } | ThreadRefusal {
  return utf8Length(JSON.stringify(thread)) > MAX_ROW_BYTES
    ? {
        kind: "refused",
        reason: `the thread is longer than ${String(MAX_ROW_BYTES)} bytes once stored`,
      }
    : { kind: "thread", thread };
}

export function parseXThreadValue(thread: XThreadValue, statusId: string): ThreadParse {
  return parsing(() => parseThread(thread, statusId));
}

export function parseJoinedXThread(
  { thread, followUps }: Readonly<Pick<JoinedPost, "thread" | "followUps">>,
  statusId: string,
): StoredParse {
  return parsing(() => ({ ...parseThread(thread, statusId), followUps }));
}

const THREAD_FIELDS = fieldNamesOf(XThreadSchema);

type ThreadRead =
  | { readonly kind: "value"; readonly value: XThreadValue }
  | { readonly kind: "refused"; readonly reason: string; readonly logged: string };

function readThread(
  answer: string,
  schema: typeof XThreadSchema | typeof XBotThreadSchema,
): ThreadRead {
  let json: unknown;

  try {
    json = JSON.parse(answer);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) {
      return { kind: "refused", reason: NOT_READABLE, logged: "not-json" };
    }

    throw error;
  }

  const parsed = schema.safeParse(json);

  if (parsed.success) return { kind: "value", value: parsed.data };

  const [issue] = parsed.error.issues;

  const detail = [issue?.path.join("."), issue?.message]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

  return {
    kind: "refused",
    reason: `the content is not an X thread: ${detail}`,
    logged: issueCodesOf(parsed.error, THREAD_FIELDS),
  };
}

export function readXBotThreadValue(answer: string): ThreadRead {
  return readThread(answer, XBotThreadSchema);
}

export function parseXThread(answer: string, statusId: string): StoredParse {
  const read = readThread(answer, XThreadSchema);

  if (read.kind !== "value") return read;

  const original = parseXThreadValue(read.value, statusId);

  if (original.kind === "refused") return original;

  const stored = storedXThread(read.value);

  if (stored.kind === "refused") return stored;

  const everyReply = new Set(read.value.replies.map(({ id }) => id));

  return parseJoinedXThread(joinedPost(read.value, everyReply, {}), statusId);
}
