import { isPlainCodeDrop } from "./comment-filter.ts";
import { storedCommentId } from "./comment-id.ts";
import type { ParsedThread, ThreadParse } from "./reddit-json.ts";
import { checkedMetadata, checkedText, refuse, refusing } from "./reddit-tree.ts";
import { MAX_ROW_BYTES, type ThreadNode, rowFits } from "./thread-rows.ts";
import { type XReply, type XThread, XThreadSchema } from "./x-wire.ts";

const TITLE_CHARACTERS = 120;

const NOT_READABLE = "the content is not readable JSON";

interface Placed {
  readonly reply: XReply;
  readonly parentId: string | null;
  readonly depth: number;
}

function firstLineOf(text: string): string {
  return (
    text
      .split(/\r\n|[\r\n\u2028\u2029]/u)
      .find((line) => line.trim() !== "")
      ?.trim() ?? ""
  );
}

function postTitle(text: string): string {
  const characters = Array.from(firstLineOf(text));

  if (characters.length <= TITLE_CHARACTERS) return characters.join("");

  const head = characters.slice(0, TITLE_CHARACTERS + 1);
  const space = head.findLastIndex((character) => /\s/u.test(character));

  return head
    .slice(0, space > 0 ? space : TITLE_CHARACTERS)
    .join("")
    .trimEnd();
}

function readThread(answer: string): XThread {
  try {
    const parsed = XThreadSchema.safeParse(JSON.parse(answer));

    if (parsed.success) return parsed.data;

    const [issue] = parsed.error.issues;

    const detail = [issue?.path.join("."), issue?.message]
      .filter((part) => part !== undefined && part !== "")
      .join(" ");

    return refuse(`the content is not an X thread: ${detail}`);
  } catch (error) {
    if (error instanceof SyntaxError) return refuse(NOT_READABLE);

    throw error;
  }
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

  for (const { id, parentId } of replies) {
    if (!ids.has(parentId)) {
      refuse(`the parentId ${parentId} of reply ${id} is not the post or a reply of the answer`);
    }
  }
}

function order<Value extends bigint | number>(first: Value, second: Value): number {
  if (first === second) return 0;

  return first < second ? -1 : 1;
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
  const stack = placed(children.get(postId), null, 0);

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

function nodeOf({ reply, parentId, depth }: Readonly<Placed>, position: number): ThreadNode {
  const eligible = !isPlainCodeDrop(reply.author, reply.text);

  const node: ThreadNode = {
    id: storedCommentId(reply.id),
    parentId,
    position,
    depth,
    kind: "comment",
    author: reply.author,
    body: eligible ? reply.text : null,
    score: reply.likes,
    postedAt: reply.postedAt,
    eligible,
  };

  if (!rowFits(node)) {
    refuse(
      `the stored row of reply ${reply.id} is longer than ${String(MAX_ROW_BYTES)} bytes once escaped`,
    );
  }

  return node;
}

function parseThread(answer: string, statusId: string): ParsedThread {
  const { post, replies } = readThread(answer);

  if (post.id !== statusId) refuse(`the post id ${post.id} is not the status id in the link`);

  checkedMetadata({ "the post author": post.author });
  checkedText(post.text, "the post text");
  checkedReplies(post.id, replies);

  return {
    title: postTitle(post.text),
    author: post.author,
    community: null,
    postText: post.text,
    postedAt: post.postedAt,
    reported: post.replies,
    linkedUrl: null,
    nodes: walk(post.id, replies).map((entry, position) => nodeOf(entry, position)),
  };
}

export function parseXThread(answer: string, statusId: string): ThreadParse {
  const read = refusing(() => parseThread(answer, statusId));

  return read.kind === "read" ? { kind: "thread", thread: read.value } : read;
}
