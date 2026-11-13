import { type Judgement, MAX_LINKS, type StoredPost, linkCount } from "./x-oembed.ts";
import type { XReply, XThreadValue } from "./x-wire.ts";

const SLICE_REQUESTS = 40;

export type Judged = Readonly<Record<string, Judgement>>;

export type Progress =
  | { readonly kind: "asking"; readonly pending: readonly StoredPost[] }
  | { readonly kind: "refused" }
  | {
      readonly kind: "ready";
      readonly thread: XThreadValue;
      readonly dropped: number;
      readonly unverifiedTails: number;
    };

function postsOf({ post, replies }: Readonly<XThreadValue>): readonly StoredPost[] {
  return [post, ...replies].map(({ id, author, text }) => ({ id, author, text }));
}

function costOf({ text }: Readonly<StoredPost>): number {
  return 1 + Math.min(linkCount(text), MAX_LINKS);
}

export function sliceOf(
  thread: Readonly<XThreadValue>,
  judgedSoFar: Judged,
): readonly StoredPost[] {
  const pending = postsOf(thread).filter(({ id }) => judgedSoFar[id] === undefined);
  const [first] = pending;

  if (first === undefined) return [];

  if (first.id === thread.post.id) return [first];

  const chosen: StoredPost[] = [];
  let planned = 0;

  for (const post of pending) {
    planned += costOf(post);

    if (planned > SLICE_REQUESTS && chosen.length > 0) break;

    chosen.push(post);
  }

  return chosen;
}

export function startingJudged({ post, replies }: Readonly<XThreadValue>): Judged {
  const root = BigInt(post.id);

  return Object.fromEntries(
    replies
      .filter(({ id, parentId }) => BigInt(id) <= root || BigInt(parentId) >= BigInt(id))
      .map(({ id }) => [id, "rejected"] as const),
  );
}

function survivor(
  reply: Readonly<XReply>,
  byId: Readonly<ReadonlyMap<string, XReply>>,
  kept: Readonly<ReadonlySet<string>>,
  postId: string,
): string {
  const seen = new Set<string>();

  for (
    let parent = reply.parentId;
    !seen.has(parent);
    parent = byId.get(parent)?.parentId ?? postId
  ) {
    if (parent === postId || kept.has(parent)) return parent;

    seen.add(parent);
  }

  return postId;
}

function reattached(
  reply: Readonly<XReply>,
  byId: Readonly<ReadonlyMap<string, XReply>>,
  kept: Readonly<ReadonlySet<string>>,
  postId: string,
): XReply {
  return { ...reply, parentId: survivor(reply, byId, kept, postId) };
}

function withoutDropped(
  { post, replies }: Readonly<XThreadValue>,
  kept: Readonly<ReadonlySet<string>>,
): XThreadValue {
  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  const surviving = replies.filter(({ id }) => kept.has(id));
  const dropped = replies.length - surviving.length;

  return {
    post: dropped === 0 ? post : { ...post, replies: Math.max(post.replies ?? 0, replies.length) },
    replies: surviving.map((reply) => reattached(reply, byId, kept, post.id)),
  };
}

export function progressOf(thread: Readonly<XThreadValue>, judgedSoFar: Judged): Progress {
  if (judgedSoFar[thread.post.id] === "rejected") return { kind: "refused" };

  const pending = postsOf(thread).filter(({ id }) => judgedSoFar[id] === undefined);

  if (pending.length > 0) return { kind: "asking", pending };

  const kept = new Set(
    thread.replies.filter(({ id }) => judgedSoFar[id] !== "rejected").map(({ id }) => id),
  );

  return {
    kind: "ready",
    thread: withoutDropped(thread, kept),
    dropped: thread.replies.length - kept.size,
    unverifiedTails: postsOf(thread).filter(
      ({ id }) => judgedSoFar[id] === "tail-unverified" && (id === thread.post.id || kept.has(id)),
    ).length,
  };
}
