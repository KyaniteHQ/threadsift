import { browser } from "wxt/browser";
import { z } from "zod";

import { THREAD_CONTENT_BYTES } from "../../src/core/limits.ts";
import { redditRefOf } from "../../src/core/links.ts";
import { hiddenRepliesOf, unfilledStubsOf } from "../../src/core/reddit-tree.ts";
import {
  REQUEST_DEADLINE_MS,
  THREAD_QUERY,
  fillAnswers,
  permalinkPath,
} from "../../src/core/thread-fill.ts";
import { resultInTab } from "./tab-result.ts";
import { type ThreadBody, fitThreadBody } from "./thread-body.ts";

const FILL_DEADLINE_MS = 150_000;

const TabAnswerSchema = z.object({
  status: z.number(),
  text: z.string(),
  remaining: z.string().nullable(),
});

type TabAnswer = z.infer<typeof TabAnswerSchema>;

const NO_ANSWER: TabAnswer = { status: 0, text: "", remaining: null };

export interface ThreadTab {
  readonly id: number;
  readonly url: string;
}

async function readInTab(
  address: string,
  deadlineMs: number,
  maxBytes: number,
): Promise<TabAnswer> {
  let remaining: string | null = null;

  try {
    const response = await fetch(address, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(deadlineMs),
    });

    remaining = response.headers.get("x-ratelimit-remaining");

    const declared = Number(response.headers.get("content-length"));

    if (response.status !== 200 || response.body === null) {
      return { status: response.status, text: "", remaining };
    }

    if (declared > maxBytes) return { status: 0, text: "", remaining };

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

    return {
      status: 200,
      text: await new Response(response.body.pipeThrough(limited)).text(),
      remaining,
    };
  } catch {
    return { status: 0, text: "", remaining };
  }
}

async function answerFor(tabId: number, address: string, deadlineMs: number): Promise<TabAnswer> {
  const answer = await resultInTab(
    () =>
      browser.scripting.executeScript({
        target: { tabId },
        func: readInTab,
        args: [address, deadlineMs, THREAD_CONTENT_BYTES],
      }),
    TabAnswerSchema,
  );

  return answer ?? NO_ANSWER;
}

function threadAddress({ url }: Readonly<ThreadTab>): string {
  const { origin, pathname } = new URL(url);

  return `${origin}${pathname.replace(/\/+$/u, "")}/.json?${THREAD_QUERY}`;
}

function stopped(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

interface ThreadRead {
  readonly fill?: true;
  readonly signal?: AbortSignal;
}

export type Completeness = "whole" | "replies-missing" | "page-only";

export function pageCompleteness({ url }: Readonly<ThreadTab>): Completeness {
  return redditRefOf(url) === null ? "whole" : "page-only";
}

export interface Fetched<Body> {
  readonly body: Body;
  readonly completeness: Completeness;
}

export async function fetchThread(
  tab: Readonly<ThreadTab>,
  { fill, signal }: Readonly<ThreadRead> = {},
): Promise<Fetched<ThreadBody> | null> {
  const ref = redditRefOf(tab.url);

  if (ref === null) return null;

  const first = await answerFor(tab.id, threadAddress(tab), REQUEST_DEADLINE_MS);
  const hidden = first.status === 200 ? hiddenRepliesOf(first.text, ref.postId) : null;

  if (hidden === null || stopped(signal)) return null;

  const filled = await fillAnswers(
    (address, deadlineMs) => answerFor(tab.id, address, deadlineMs),
    {
      addressFor: (commentId) =>
        `${new URL(tab.url).origin}${permalinkPath(ref.postId, commentId)}`,
      postId: ref.postId,
      first,
      hidden,
    },
    { deadlineMs: FILL_DEADLINE_MS, signal },
  );

  if (stopped(signal)) return null;

  const body = fitThreadBody(tab.url, filled.answers, fill === true);

  if (body === null) return null;

  const unfilled = unfilledStubsOf(body.content, ref.postId);

  return { body, completeness: unfilled === 0 ? "whole" : "replies-missing" };
}
