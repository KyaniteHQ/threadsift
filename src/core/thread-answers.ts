import { z } from "zod";

import { utf8Length } from "./digest-prompt.ts";
import { type WireChild, ThreadJson } from "./reddit-wire.ts";

export const MORE_REQUEST_CAP = 100;

export const MAX_THREAD_ANSWERS = 1 + MORE_REQUEST_CAP;

export const THREAD_CONTENT_BYTES = 4 * 1024 * 1024;

export const ITEM_REQUEST_BYTES = 8 * 1024 * 1024;

export interface SentAnswers {
  readonly bytes: number;
  readonly count: number;
}

export function emptyRequest(url: string): SentAnswers {
  return { bytes: utf8Length(JSON.stringify({ url, content: [] })), count: 0 };
}

export function admit(sent: Readonly<SentAnswers>, answer: string): SentAnswers | null {
  const bytes = sent.bytes + utf8Length(JSON.stringify(answer)) + (sent.count === 0 ? 0 : 1);

  const fits =
    utf8Length(answer) <= THREAD_CONTENT_BYTES &&
    bytes <= ITEM_REQUEST_BYTES &&
    sent.count < MAX_THREAD_ANSWERS;

  return fits ? { bytes, count: sent.count + 1 } : null;
}

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
