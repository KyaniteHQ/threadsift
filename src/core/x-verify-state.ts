import { authorPartsOf } from "./x-author-thread.ts";
import { joinedPost, leadingQuotes } from "./x-joined-post.ts";
import { MAX_LINKS, type StoredPost, linkCount } from "./x-oembed.ts";
import { type Judged, judgementOn, photosRejectedOn, rejectedJudged } from "./x-verdict.ts";
import type { XReply, XThreadValue } from "./x-wire.ts";

const SLICE_REQUESTS = 40;

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
      readonly photoless: number;
    };

function postsOf(
  { post, replies }: Readonly<XThreadValue>,
  judgedSoFar: Judged,
): readonly StoredPost[] {
  const chain = [post, ...leadingQuotes(post.quoted, judgedSoFar)].map(
    ({ id, author, text, images }, index): StoredPost => ({
      id,
      author,
      text,
      photos: images.length > 0,
      role: { kind: index === 0 ? "root" : "quote", next: post.quoted[index]?.id ?? null },
    }),
  );

  const authorParts = new Set(authorPartsOf({ post, replies }).map(({ id }) => id));

  return [
    ...chain,
    ...replies.map(({ id, author, text, images }): StoredPost => ({
      id,
      author,
      text,
      photos: images.length > 0,
      role: { kind: "reply", recipientsMayBeOmitted: !authorParts.has(id) },
    })),
  ];
}

function costOf({ text, role }: Readonly<StoredPost>): number {
  return role.kind === "root" ? SLICE_REQUESTS : 2 + Math.min(linkCount(text), MAX_LINKS);
}

export function sliceOf(
  thread: Readonly<XThreadValue>,
  judgedSoFar: Judged,
): readonly StoredPost[] {
  const pending = postsOf(thread, judgedSoFar).filter(
    ({ id }) => judgementOn(judgedSoFar, id) === undefined,
  );

  const chosen: StoredPost[] = [];
  let planned = 0;

  for (const post of pending) {
    if (planned >= SLICE_REQUESTS) break;

    const total = planned + costOf(post);

    if (total > SLICE_REQUESTS && chosen.length > 0) break;

    chosen.push(post);
    planned = total;
  }

  return chosen;
}

export function hasPossibleParent({ id, parentId }: Readonly<XReply>, rootId: string): boolean {
  const parent = BigInt(parentId);

  return parent >= BigInt(rootId) && parent < BigInt(id);
}

export function startingJudged({ post, replies }: Readonly<XThreadValue>): Judged {
  return rejectedJudged(
    replies.filter((reply) => !hasPossibleParent(reply, post.id)).map(({ id }) => id),
  );
}

export function progressOf(thread: Readonly<XThreadValue>, judgedSoFar: Judged): Progress {
  if (judgementOn(judgedSoFar, thread.post.id) === "rejected") return { kind: "refused" };

  const posts = postsOf(thread, judgedSoFar);
  const pending = posts.filter(({ id }) => judgementOn(judgedSoFar, id) === undefined);

  if (pending.length > 0) return { kind: "asking", pending };

  const kept = new Set(
    thread.replies
      .filter(({ id }) => judgementOn(judgedSoFar, id) !== "rejected")
      .map(({ id }) => id),
  );

  const { thread: joined, followUps, quotes } = joinedPost(thread, kept, judgedSoFar);
  const shown = new Set([thread.post.id, ...kept, ...quotes.map(({ id }) => id)]);

  return {
    kind: "ready",
    thread: joined,
    followUps,
    quoted: quotes.length,
    dropped: thread.replies.length - kept.size,
    unverifiedTails: posts.filter(
      ({ id }) => judgementOn(judgedSoFar, id) === "tail-unverified" && shown.has(id),
    ).length,
    photoless: posts.filter(
      ({ id, photos }) => photos && photosRejectedOn(judgedSoFar, id) && shown.has(id),
    ).length,
  };
}
