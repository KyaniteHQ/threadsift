import { authorPartsOf } from "./x-author-thread.ts";
import { noPhotosKey } from "./x-images.ts";
import { joinedPost, leadingQuotes } from "./x-joined-post.ts";
import { type Judgement, MAX_LINKS, type StoredPost, linkCount } from "./x-oembed.ts";
import type { XThreadValue } from "./x-wire.ts";

const SLICE_REQUESTS = 40;

export type StoredJudgement =
  | Judgement
  | "verified-without-recipients"
  | "tail-unverified-without-recipients";
export type Judged = Readonly<Record<string, StoredJudgement>>;

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
    ({ id, author, text, images }, index) => ({
      id,
      author,
      text,
      photos: images.length > 0,
      recipientsMayBeOmitted: false,
      chain: { next: post.quoted[index]?.id ?? null },
    }),
  );

  const authorParts = new Set(authorPartsOf({ post, replies }).map(({ id }) => id));

  return [
    ...chain,
    ...replies.map(({ id, author, text, images }) => ({
      recipientsMayBeOmitted: !authorParts.has(id),
      id,
      author,
      text,
      photos: images.length > 0,
    })),
  ];
}

function costOf({ text }: Readonly<StoredPost>): number {
  return 2 + Math.min(linkCount(text), MAX_LINKS);
}

export function sliceOf(
  thread: Readonly<XThreadValue>,
  judgedSoFar: Judged,
): readonly StoredPost[] {
  const pending = postsOf(thread, judgedSoFar).filter(({ id }) => judgedSoFar[id] === undefined);
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
      .filter(({ id, parentId }) => BigInt(parentId) < root || BigInt(parentId) >= BigInt(id))
      .map(({ id }) => [id, "rejected"] as const),
  );
}

export function progressOf(thread: Readonly<XThreadValue>, judgedSoFar: Judged): Progress {
  if (judgedSoFar[thread.post.id] === "rejected") return { kind: "refused" };

  const posts = postsOf(thread, judgedSoFar);
  const pending = posts.filter(({ id }) => judgedSoFar[id] === undefined);

  if (pending.length > 0) return { kind: "asking", pending };

  const kept = new Set(
    thread.replies.filter(({ id }) => judgedSoFar[id] !== "rejected").map(({ id }) => id),
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
      ({ id }) =>
        (judgedSoFar[id] === "tail-unverified" ||
          judgedSoFar[id] === "tail-unverified-without-recipients") &&
        shown.has(id),
    ).length,
    photoless: posts.filter(
      ({ id, photos }) =>
        photos === true && judgedSoFar[noPhotosKey(id)] === "rejected" && shown.has(id),
    ).length,
  };
}
