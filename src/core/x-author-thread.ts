import { utf8Length } from "./encoding.ts";
import { INLINE_TEXT_BYTES } from "./limits.ts";
import { closedBlocks } from "./x-blocks.ts";
import { withImages } from "./x-images.ts";
import type { XReply, XThreadValue } from "./x-wire.ts";

const NOT_SAVED_NOTE = "Author follow-up posts that X did not confirm were not saved.";

export const PART_SEPARATOR = "\n\n";

type RepliesById = Readonly<ReadonlyMap<string, Readonly<XReply>>>;

type Ids = Readonly<ReadonlySet<string>>;

export interface JoinedAuthorThread {
  readonly thread: XThreadValue;
  readonly followUps: number;
}

function sameHandle(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

function survivingParent(
  reply: Readonly<XReply>,
  byId: RepliesById,
  kept: Ids,
  postId: string,
): string {
  const seen = new Set<string>();

  for (
    let parent = reply.parentId;
    !seen.has(parent);
    parent = byId.get(parent)?.parentId ?? postId
  ) {
    if (!byId.has(parent) || kept.has(parent)) return parent;

    seen.add(parent);
  }

  return postId;
}

function partParent(
  reply: Readonly<XReply>,
  byId: RepliesById,
  kept: Ids,
  post: Readonly<XThreadValue["post"]>,
): string | null {
  const seen = new Set<string>();

  for (let id = reply.parentId; id !== post.id;) {
    if (kept.has(id)) return id;

    const parent = byId.get(id);

    if (parent === undefined || !sameHandle(parent.author, post.author) || seen.has(id))
      return null;

    seen.add(id);
    id = parent.parentId;
  }

  return post.id;
}

function followUpTo(
  tipId: string,
  { post, replies }: Readonly<XThreadValue>,
  byId: RepliesById,
  kept: Ids,
): XReply | undefined {
  return replies
    .filter(
      (reply) =>
        kept.has(reply.id) &&
        reply.repairedParent !== true &&
        BigInt(reply.id) > BigInt(tipId) &&
        sameHandle(reply.author, post.author) &&
        partParent(reply, byId, kept, post) === tipId,
    )
    .toSorted((first, second) => (BigInt(first.id) < BigInt(second.id) ? -1 : 1))
    .at(0);
}

function authorThreadOf(
  thread: Readonly<XThreadValue>,
  byId: RepliesById,
  kept: Ids,
): Readonly<XReply>[] {
  const followUps: XReply[] = [];

  for (
    let next = followUpTo(thread.post.id, thread, byId, kept);
    next !== undefined;
    next = followUpTo(next.id, thread, byId, kept)
  ) {
    followUps.push(next);
  }

  return followUps;
}

function partText({ text, images }: Readonly<XReply>): string {
  return withImages(closedBlocks(text), images);
}

function fittingText(text: string, followUps: readonly Readonly<XReply>[]): XReply[] {
  const room =
    INLINE_TEXT_BYTES - utf8Length(text) - utf8Length(`${PART_SEPARATOR}${NOT_SAVED_NOTE}`);

  const fitting: XReply[] = [];
  let used = 0;

  for (const followUp of followUps) {
    used += utf8Length(`${PART_SEPARATOR}${partText(followUp)}`);

    if (used > room) break;

    fitting.push(followUp);
  }

  return fitting;
}

export function authorPartsOf(thread: Readonly<XThreadValue>): readonly Readonly<XReply>[] {
  const byId = new Map(thread.replies.map((reply) => [reply.id, reply]));

  return authorThreadOf(thread, byId, new Set(byId.keys()));
}

export function withPartImagesOnly(thread: Readonly<XThreadValue>): XThreadValue {
  const partIds = new Set(authorPartsOf(thread).map(({ id }) => id));

  return {
    ...thread,
    replies: thread.replies.map((reply) =>
      partIds.has(reply.id) ? reply : { ...reply, images: [] },
    ),
  };
}

export function joinedAuthorThread(thread: Readonly<XThreadValue>, kept: Ids): JoinedAuthorThread {
  const { post, replies } = thread;
  const byId = new Map(replies.map((reply) => [reply.id, reply]));
  const shown = authorThreadOf(thread, byId, kept);
  const fitting = fittingText(post.text, shown);

  const refused = authorThreadOf(thread, byId, new Set(byId.keys())).filter(
    ({ id }) => !kept.has(id),
  );

  const parts = new Set([...shown, ...refused].map(({ id }) => id));
  const notSaved = refused.length + shown.length - fitting.length;
  const others = replies.filter(({ id }) => !parts.has(id));
  const keptOthers = new Set(others.filter(({ id }) => kept.has(id)).map(({ id }) => id));
  const reported = post.replies === null ? null : Math.max(0, post.replies - parts.size);

  const text = [
    post.text,
    ...fitting.flatMap((followUp) => {
      const part = partText(followUp);

      return part === "" ? [] : [part];
    }),
    ...(notSaved > 0 ? [NOT_SAVED_NOTE] : []),
  ].join(PART_SEPARATOR);

  return {
    thread: {
      post: {
        ...post,
        text,
        replies:
          keptOthers.size === others.length ? reported : Math.max(reported ?? 0, others.length),
      },
      replies: others
        .filter(({ id }) => keptOthers.has(id))
        .map((reply) =>
          Object.assign(reply, { parentId: survivingParent(reply, byId, keptOthers, post.id) }),
        ),
    },
    followUps: fitting.length,
  };
}
