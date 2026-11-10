import { z } from "zod";

import { type WireChild, ThreadJson } from "./reddit-wire.ts";
import { MAX_THREAD_ANSWERS } from "./request-limits.ts";

export type ThreadAnswers = readonly [string, ...string[]];

const ANSWERS_ERROR = `a string, or 1 to ${String(MAX_THREAD_ANSWERS)} strings`;

export const ThreadAnswersSchema = z.union(
  [
    z.string().transform((answer): ThreadAnswers => [answer]),
    z
      .tuple([z.string()], z.string())
      .refine((answers) => answers.length <= MAX_THREAD_ANSWERS, { error: ANSWERS_ERROR }),
  ],
  { error: ANSWERS_ERROR },
);

const COMMENT_PREFIX = "t1_";

function pendingOf(children: readonly WireChild[]): WireChild[] {
  return children.toReversed();
}

function idsBehind({
  parent_id: parent,
  children,
}: Readonly<{ parent_id: string; children: readonly string[] }>): readonly string[] {
  if (children.length > 0) return children;

  return parent.startsWith(COMMENT_PREFIX) ? [parent.slice(COMMENT_PREFIX.length)] : [];
}

export function hiddenRepliesOf(content: string, postId: string): readonly string[] | null {
  try {
    const parsed = ThreadJson.safeParse(JSON.parse(content));

    if (!parsed.success) return null;

    const [posts, comments] = parsed.data;
    const [{ data: post }] = posts.data.children;

    if (post.id.toLowerCase() !== postId.toLowerCase()) return null;

    const hidden: string[] = [];
    const stack = pendingOf(comments.data.children);

    for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
      if (next.kind === "more") {
        hidden.push(...idsBehind(next.data));
        continue;
      }

      const { replies } = next.data;

      if (replies !== undefined && replies !== "") stack.push(...pendingOf(replies.data.children));
    }

    return hidden;
  } catch {
    return null;
  }
}
