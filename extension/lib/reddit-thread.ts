import { browser } from "wxt/browser";
import { z } from "zod";

import {
  ITEM_REQUEST_BYTES,
  MORE_REQUEST_CAP,
  THREAD_CONTENT_BYTES,
} from "../../src/core/limits.ts";
import { redditRefOf } from "../../src/core/links.ts";
import { pause } from "../../src/core/pause.ts";
import { hiddenRepliesOf } from "../../src/core/reddit-tree.ts";
import type { ThreadAnswers } from "../../src/core/thread-answers.ts";
import { resultInTab } from "./tab-result.ts";

export const REQUEST_SPACING_MS = 500;

export const FILL_DEADLINE_MS = 150_000;

const REQUEST_DEADLINE_MS = 15_000;

const QUERY = "limit=500&raw_json=1";

const RATE_LIMITED = 429;

const TabAnswerSchema = z.object({ status: z.number(), text: z.string() });

type TabAnswer = z.infer<typeof TabAnswerSchema>;

const NO_ANSWER: TabAnswer = { status: 0, text: "" };

export interface ThreadTab {
  readonly id: number;
  readonly url: string;
}

async function readInTab(
  address: string,
  deadlineMs: number,
  maxBytes: number,
): Promise<TabAnswer> {
  try {
    const response = await fetch(address, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(deadlineMs),
    });

    const declared = Number(response.headers.get("content-length"));

    if (response.status !== 200 || response.body === null) {
      return { status: response.status, text: "" };
    }

    if (declared > maxBytes) return { status: 0, text: "" };

    let received = 0;

    const limited = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;

        if (received > maxBytes) {
          controller.error(new RangeError("the answer is longer than the limit"));
        } else {
          controller.enqueue(chunk);
        }
      },
    });

    return { status: 200, text: await new Response(response.body.pipeThrough(limited)).text() };
  } catch {
    return { status: 0, text: "" };
  }
}

async function answerFor(tabId: number, address: string): Promise<TabAnswer> {
  const answer = await resultInTab(
    () =>
      browser.scripting.executeScript({
        target: { tabId },
        func: readInTab,
        args: [address, REQUEST_DEADLINE_MS, THREAD_CONTENT_BYTES],
      }),
    TabAnswerSchema,
  );

  return answer ?? NO_ANSWER;
}

function threadAddress({ url }: Readonly<ThreadTab>): string {
  const { origin, pathname } = new URL(url);

  return `${origin}${pathname.replace(/\/+$/u, "")}/.json?${QUERY}`;
}

function permalinkAddress({ url }: Readonly<ThreadTab>, postId: string, commentId: string): string {
  return `${new URL(url).origin}/comments/${postId}/_/${commentId}.json?${QUERY}`;
}

async function fillAnswers(
  tab: Readonly<ThreadTab>,
  postId: string,
  first: string,
  hidden: readonly string[],
): Promise<ThreadAnswers> {
  const answers: [string, ...string[]] = [first];
  const queue = [...hidden];
  const asked = new Set<string>();
  const giveUpAt = Date.now() + FILL_DEADLINE_MS;
  let held = first.length;
  let startedAt = Date.now();
  let at = 0;

  while (
    at < queue.length &&
    asked.size < MORE_REQUEST_CAP &&
    Date.now() < giveUpAt &&
    held <= ITEM_REQUEST_BYTES
  ) {
    const id = queue[at];
    at += 1;

    if (id === undefined || asked.has(id)) continue;

    asked.add(id);

    // oxlint-disable-next-line eslint/no-await-in-loop -- the requests are sequential and spaced.
    await pause(Math.max(0, REQUEST_SPACING_MS - (Date.now() - startedAt)));
    startedAt = Date.now();

    // oxlint-disable-next-line eslint/no-await-in-loop -- the requests are sequential and spaced.
    const answer = await answerFor(tab.id, permalinkAddress(tab, postId, id));

    if (answer.status === RATE_LIMITED) break;

    const found = answer.status === 200 ? hiddenRepliesOf(answer.text, postId) : null;

    if (found === null) continue;

    answers.push(answer.text);
    queue.push(...found);
    held += answer.text.length;
  }

  return answers;
}

function byteLength(text: string): number {
  return new Blob([text]).size;
}

function fitted(url: string, answers: ThreadAnswers): ThreadAnswers | null {
  const [first, ...later] = answers;
  let size = byteLength(JSON.stringify({ url, content: answers }));

  while (size > ITEM_REQUEST_BYTES) {
    const dropped = later.pop();

    if (dropped === undefined) return null;

    size -= byteLength(JSON.stringify(dropped)) + 1;
  }

  return [first, ...later];
}

export async function fetchThread(tab: Readonly<ThreadTab>): Promise<ThreadAnswers | null> {
  const ref = redditRefOf(tab.url);

  if (ref === null) return null;

  const first = await answerFor(tab.id, threadAddress(tab));
  const hidden = first.status === 200 ? hiddenRepliesOf(first.text, ref.postId) : null;

  return hidden === null
    ? null
    : fitted(tab.url, await fillAnswers(tab, ref.postId, first.text, hidden));
}
