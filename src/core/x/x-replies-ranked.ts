import { storedCommentId } from "../contract/comment-id.ts";
import { X_REPLIES_KEPT_MAX, X_REPLIES_LIKES_PERCENT, X_REPLIES_MIN } from "../contract/limits.ts";
import { NO_TEXT, withoutPlaceholder } from "../contract/x-images.ts";
import type { XCliReply, XCliThreadValue, XReply, XThreadValue } from "../contract/x-wire.ts";
import type { Database } from "../kernel/database.ts";
import { storedReplyCount } from "../thread/thread-store.ts";
import { authorPartsOf } from "./x-author-thread.ts";
import { hasPossibleParent, order } from "./x-reply-order.ts";
import { parseXThreadValue, storedXThread } from "./x-thread.ts";

const PERCENT = 100;

function hasText({ text }: Readonly<XCliReply>): boolean {
  const trimmed = text.trim();

  return trimmed !== "" && trimmed !== NO_TEXT;
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

function plainReply({ id, parentId, author, text, postedAt, likes, images }: XCliReply): XReply {
  return { id, parentId, author, text, postedAt, likes, images };
}

function rankedThread(
  thread: Readonly<XCliThreadValue>,
  held: number,
  keptComments: readonly string[],
): XThreadValue {
  const byId = new Map(thread.replies.map((reply) => [reply.id, reply]));
  const parts = authorPartsOf(thread).map(({ id }) => id);
  const partIds = new Set(parts);

  const possible = thread.replies.filter((reply) => hasPossibleParent(reply, thread.post.id));
  const ranked = possible
    .filter((reply) => !partIds.has(reply.id) && hasText(reply))
    .toSorted(moreImportant);

  const rankedIds = ranked.map(({ id }) => id);
  const picked = new Set(keptComments);
  const digestIds = rankedIds.filter((id) => picked.has(storedCommentId(id)));
  const keptFor = (count: number) =>
    withAncestors([...parts, ...digestIds, ...rankedIds.slice(0, count)], byId);

  const storedIn = (kept: Readonly<ReadonlySet<string>>) =>
    possible.filter((reply) => kept.has(reply.id) && (partIds.has(reply.id) || hasText(reply)))
      .length;

  let count = Math.min(
    ranked.length,
    clamped(likesShareCount(ranked), X_REPLIES_MIN, X_REPLIES_KEPT_MAX),
  );

  while (count < ranked.length && storedIn(keptFor(count)) < held) count += 1;

  const kept = keptFor(count);
  const dropped = kept.size < thread.replies.length;
  const post = withoutPlaceholder(thread.post);

  return {
    post: {
      ...post,
      quoted: post.quoted.map((quoted) => withoutPlaceholder(quoted)),
      replies: dropped ? Math.max(post.replies ?? 0, thread.replies.length) : post.replies,
    },
    replies: thread.replies
      .filter(({ id }) => kept.has(id))
      .map((reply) =>
        plainReply(partIds.has(reply.id) ? withoutPlaceholder(reply) : { ...reply, images: [] }),
      ),
  };
}

export async function readFetchedThread(
  db: Database,
  itemId: number,
  statusId: string,
  thread: Readonly<XCliThreadValue>,
  keptComments: readonly string[],
): Promise<ReturnType<typeof storedXThread>> {
  const parsed = parseXThreadValue(thread, statusId);

  if (parsed.kind === "refused") return parsed;

  return storedXThread(rankedThread(thread, await storedReplyCount(db, itemId), keptComments));
}
