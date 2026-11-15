import { X_REPLIES_KEPT_MAX, X_REPLIES_LIKES_PERCENT, X_REPLIES_MIN } from "./limits.ts";
import type { Database } from "./ports.ts";
import { authorPartsOf } from "./x-author-thread.ts";
import { storedReplyCount } from "./x-partial.ts";
import { order, parseXThreadValue } from "./x-thread.ts";
import type { XCliReply, XCliThreadValue, XReply, XThreadValue } from "./x-wire.ts";

const PERCENT = 100;

const NO_TEXT = "(No text content)";

function hasText({ text }: Readonly<XCliReply>): boolean {
  return text.trim() !== NO_TEXT;
}

function clamped(value: number, floor: number, ceiling: number): number {
  return Math.min(Math.max(value, floor), ceiling);
}

function likesOf({ likes }: Readonly<XCliReply>): number {
  return likes ?? 0;
}

function moreImportant(first: Readonly<XCliReply>, second: Readonly<XCliReply>): number {
  return (
    order(likesOf(second), likesOf(first)) ||
    order(second.replies ?? 0, first.replies ?? 0) ||
    order(BigInt(first.id), BigInt(second.id))
  );
}

function likesShareCount(ranked: readonly Readonly<XCliReply>[]): number {
  const total = ranked.reduce((sum, reply) => sum + likesOf(reply), 0);
  let held = 0;

  for (const [count, reply] of ranked.entries()) {
    if (held * PERCENT >= total * X_REPLIES_LIKES_PERCENT) return count;

    held += likesOf(reply);
  }

  return ranked.length;
}

function withAncestors(
  topIds: readonly string[],
  byId: Readonly<ReadonlyMap<string, Readonly<XCliReply>>>,
): Set<string> {
  const kept = new Set<string>();

  for (const topId of topIds) {
    for (
      let at = byId.get(topId);
      at !== undefined && !kept.has(at.id);
      at = byId.get(at.parentId)
    ) {
      kept.add(at.id);
    }
  }

  return kept;
}

function plainReply({
  id,
  parentId,
  author,
  text,
  postedAt,
  likes,
  repairedParent,
}: XCliReply): XReply {
  return { id, parentId, author, text, postedAt, likes, repairedParent };
}

function rankedThread(thread: Readonly<XCliThreadValue>, held: number): XThreadValue {
  const byId = new Map(thread.replies.map((reply) => [reply.id, reply]));
  const parts = authorPartsOf(thread).map(({ id }) => id);
  const partIds = new Set(parts);

  const ranked = thread.replies
    .filter((reply) => !partIds.has(reply.id) && hasText(reply))
    .toSorted(moreImportant);

  const rankedIds = ranked.map(({ id }) => id);
  const keptFor = (count: number) => withAncestors([...parts, ...rankedIds.slice(0, count)], byId);

  const storedIn = (kept: Readonly<ReadonlySet<string>>) =>
    thread.replies.filter(
      (reply) => kept.has(reply.id) && (partIds.has(reply.id) || hasText(reply)),
    ).length;

  let count = Math.min(
    ranked.length,
    clamped(likesShareCount(ranked), X_REPLIES_MIN, X_REPLIES_KEPT_MAX),
  );

  while (count < ranked.length && storedIn(keptFor(count)) < held) count += 1;

  const kept = keptFor(count);
  const dropped = kept.size < thread.replies.length;
  const { post } = thread;

  return {
    post: dropped ? { ...post, replies: Math.max(post.replies ?? 0, thread.replies.length) } : post,
    replies: thread.replies.filter(({ id }) => kept.has(id)).map((reply) => plainReply(reply)),
  };
}

function withoutRepeats(thread: Readonly<XCliThreadValue>): XCliThreadValue {
  const seen = new Set<string>();

  return {
    ...thread,
    replies: thread.replies.filter(({ id }) => {
      if (seen.has(id)) return false;

      seen.add(id);

      return true;
    }),
  };
}

export async function readFetchedThread(
  db: Database,
  itemId: number,
  statusId: string,
  thread: Readonly<XCliThreadValue>,
): Promise<XThreadValue | null> {
  const unique = withoutRepeats(thread);

  if (parseXThreadValue(unique, statusId).kind === "refused") return null;

  return rankedThread(unique, await storedReplyCount(db, itemId));
}
