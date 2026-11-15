import { joinedPost } from "./x-joined-post.ts";
import { type Judgement, MAX_LINKS, type StoredPost, linkCount } from "./x-oembed.ts";
import type { XThreadValue } from "./x-wire.ts";

const SLICE_REQUESTS = 40;

export type Judged = Readonly<Record<string, Judgement>>;

export type Progress =
  | { readonly kind: "asking"; readonly pending: readonly StoredPost[] }
  | { readonly kind: "refused" }
  | {
      readonly kind: "ready";
      readonly thread: XThreadValue;
      readonly dropped: number;
      readonly followUps: number;
      readonly quoted: number;
      readonly unverifiedTails: number;
    };

function postsOf({ post, replies }: Readonly<XThreadValue>): readonly StoredPost[] {
  return [post, ...post.quoted, ...replies].map(({ id, author, text }) => ({ id, author, text }));
}

function costOf({ text }: Readonly<StoredPost>): number {
  return 2 + Math.min(linkCount(text), MAX_LINKS);
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

export function progressOf(thread: Readonly<XThreadValue>, judgedSoFar: Judged): Progress {
  if (judgedSoFar[thread.post.id] === "rejected") return { kind: "refused" };

  const pending = postsOf(thread).filter(({ id }) => judgedSoFar[id] === undefined);

  if (pending.length > 0) return { kind: "asking", pending };

  const kept = new Set(
    thread.replies.filter(({ id }) => judgedSoFar[id] !== "rejected").map(({ id }) => id),
  );

  const {
    thread: joined,
    followUps,
    quoted,
  } = joinedPost(thread, kept, (id) => judgedSoFar[id] !== "rejected");

  const shownQuotes = new Set(thread.post.quoted.slice(0, quoted).map((quote) => quote.id));

  return {
    kind: "ready",
    thread: joined,
    followUps,
    quoted,
    dropped: thread.replies.length - kept.size,
    unverifiedTails: postsOf(thread).filter(
      ({ id }) =>
        judgedSoFar[id] === "tail-unverified" &&
        (id === thread.post.id || kept.has(id) || shownQuotes.has(id)),
    ).length,
  };
}
