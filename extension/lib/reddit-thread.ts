import { browser } from "wxt/browser";
import { z } from "zod";

import { THREAD_CONTENT_BYTES } from "../../src/core/contract/limits.ts";
import { redditRefOf } from "../../src/core/contract/links.ts";
import { unfilledStubsOf } from "../../src/core/contract/reddit-tree.ts";
import { REQUEST_DEADLINE_MS } from "../../src/core/contract/request-waits.ts";
import {
  THREAD_QUERY,
  fillAnswers,
  hiddenIn,
  permalinkPath,
} from "../../src/core/contract/thread-fill.ts";
import { logFailure } from "./log.ts";
import { resultInTab } from "./tab-result.ts";
import { type ThreadBody, fitThreadBody } from "./thread-body.ts";

const THREAD_READ_DEADLINE_MS = 150_000;

const TabAnswerSchema = z.object({
  status: z.number(),
  text: z.string(),
  remaining: z.string().nullable(),
  failure: z.string().nullable(),
});

type TabAnswer = z.infer<typeof TabAnswerSchema>;

const NO_ANSWER: TabAnswer = { status: 0, text: "", remaining: null, failure: null };

export interface ThreadTab {
  readonly id: number;
  readonly url: string;
}

// oxlint-disable-next-line eslint/max-lines-per-function -- executeScript serializes this function alone into the tab, so it cannot call a helper.
async function readInTab(
  address: string,
  deadlineMs: number,
  maxBytes: number,
  cancelEvent: string,
): Promise<TabAnswer> {
  let remaining: string | null = null;
  const cancelled = new AbortController();

  window.addEventListener(cancelEvent, cancelled.abort.bind(cancelled), {
    signal: cancelled.signal,
  });

  try {
    const response = await fetch(address, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: AbortSignal.any([AbortSignal.timeout(deadlineMs), cancelled.signal]),
    });

    remaining = response.headers.get("x-ratelimit-remaining");

    if (response.status !== 200 || response.body === null) {
      return { status: response.status, text: "", remaining, failure: null };
    }

    if (Number(response.headers.get("content-length")) > maxBytes) {
      return { status: 0, text: "", remaining, failure: null };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";

    for (;;) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- The byte cap is checked before reading the next chunk.
      const { done, value } = await reader.read();

      if (done) return { status: 200, text: text + decoder.decode(), remaining, failure: null };

      received += value.byteLength;

      if (received > maxBytes) return { status: 0, text: "", remaining, failure: null };

      text += decoder.decode(value, { stream: true });
    }
  } catch (cause) {
    const failure =
      cause instanceof Error || cause instanceof DOMException ? cause.name : "UnknownError";

    return { status: 0, text: "", remaining, failure };
  } finally {
    cancelled.abort();
  }
}

function cancelInTab(cancelEvent: string): void {
  window.dispatchEvent(new Event(cancelEvent));
}

async function answerFor(
  tabId: number,
  address: string,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<TabAnswer | null> {
  if (signal.aborted) return null;

  const cancelEvent = `threadsift-cancel-${crypto.randomUUID()}`;

  const cancel = (): void => {
    browser.scripting
      .executeScript({ target: { tabId }, func: cancelInTab, args: [cancelEvent] })
      .catch(() => null);
  };

  signal.addEventListener("abort", cancel, { once: true });

  try {
    const answer = await resultInTab(
      () =>
        browser.scripting.executeScript({
          target: { tabId },
          func: readInTab,
          args: [address, deadlineMs, THREAD_CONTENT_BYTES, cancelEvent],
        }),
      TabAnswerSchema,
      "tab-read-failed",
    );

    if (answer === null) return null;

    if (answer.failure !== null) {
      logFailure("reddit-thread-read-failed", new Error(answer.failure));
    }

    return answer;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

function threadAddress({ url }: Readonly<ThreadTab>): string {
  const { origin, pathname } = new URL(url);

  return `${origin}${pathname.replace(/\/+$/u, "")}/.json?${THREAD_QUERY}`;
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

  const tabLost = new AbortController();
  const stop = signal === undefined ? tabLost.signal : AbortSignal.any([signal, tabLost.signal]);

  const read = async (address: string, deadlineMs: number): Promise<TabAnswer> => {
    const answer = await answerFor(tab.id, address, deadlineMs, stop);

    if (answer !== null) return answer;

    tabLost.abort();

    return NO_ANSWER;
  };

  const first = await read(threadAddress(tab), REQUEST_DEADLINE_MS);
  const hidden = hiddenIn(first, ref.postId);

  if (hidden === null || stop.aborted) return null;

  const filled = await fillAnswers(
    read,
    {
      addressFor: (commentId) =>
        `${new URL(tab.url).origin}${permalinkPath(ref.postId, commentId)}`,
      postId: ref.postId,
      first,
      hidden,
    },
    { deadlineMs: THREAD_READ_DEADLINE_MS, signal: stop },
  );

  if (stop.aborted) return null;

  const body = fitThreadBody(tab.url, filled.answers, fill === true);

  if (body === null) return null;

  const unfilled = unfilledStubsOf(body.content, ref.postId);

  if (unfilled === null) return null;

  return { body, completeness: unfilled === 0 ? "whole" : "replies-missing" };
}
