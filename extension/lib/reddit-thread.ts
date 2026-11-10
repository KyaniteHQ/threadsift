import { browser } from "wxt/browser";
import { z } from "zod";

import { redditRefOf } from "../../src/core/links.ts";
import { pause } from "../../src/core/pause.ts";
import { ITEM_REQUEST_BYTES, MORE_REQUEST_CAP } from "../../src/core/request-limits.ts";
import { type ThreadAnswers, hiddenRepliesOf } from "../../src/core/thread-answers.ts";

export const REQUEST_SPACING_MS = 500;

export const FILL_DEADLINE_MS = 150_000;

const REQUEST_DEADLINE_MS = 15_000;

const QUERY = "limit=500&raw_json=1";

const RATE_LIMITED = 429;

const TabAnswerSchema = z.object({ status: z.number(), text: z.string() });

type TabAnswer = z.infer<typeof TabAnswerSchema>;

export interface ThreadTab {
  readonly id: number;
  readonly url: string;
}

async function readInTab(address: string, deadlineMs: number): Promise<TabAnswer> {
  try {
    const response = await fetch(address, {
      credentials: "include",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(deadlineMs),
    });

    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 0, text: "" };
  }
}

async function answerFor(tabId: number, address: string): Promise<TabAnswer> {
  try {
    const [injected] = await browser.scripting.executeScript({
      target: { tabId },
      func: readInTab,
      args: [address, REQUEST_DEADLINE_MS],
    });

    const answer = TabAnswerSchema.safeParse(injected?.result);

    return answer.success ? answer.data : { status: 0, text: "" };
  } catch {
    return { status: 0, text: "" };
  }
}

function threadAddress({ url }: Readonly<ThreadTab>): string {
  const { origin, pathname } = new URL(url);

  return `${origin}${pathname.replace(/\/+$/u, "")}/.json?${QUERY}`;
}

function permalinkAddress({ url }: Readonly<ThreadTab>, postId: string, commentId: string): string {
  return `${new URL(url).origin}/comments/${postId}/_/${commentId}.json?${QUERY}`;
}

interface Plan {
  readonly tab: Readonly<ThreadTab>;
  readonly postId: string;
  readonly giveUpAt: number;
}

interface Filled {
  readonly answers: readonly string[];
  readonly waiting: readonly string[];
  readonly asked: readonly string[];
}

async function fillFrom(plan: Readonly<Plan>, state: Readonly<Filled>): Promise<readonly string[]> {
  const [next, ...waiting] = state.waiting;

  if (
    next === undefined ||
    state.asked.length >= MORE_REQUEST_CAP ||
    Date.now() >= plan.giveUpAt ||
    charactersIn(state.answers) > ITEM_REQUEST_BYTES
  ) {
    return state.answers;
  }

  if (state.asked.includes(next)) return fillFrom(plan, { ...state, waiting });

  const asked = [...state.asked, next];

  await pause(REQUEST_SPACING_MS);

  const answer = await answerFor(plan.tab.id, permalinkAddress(plan.tab, plan.postId, next));

  if (answer.status === RATE_LIMITED) return state.answers;

  const found = answer.status === 200 ? hiddenRepliesOf(answer.text, plan.postId) : null;

  if (found === null) return fillFrom(plan, { ...state, waiting, asked });

  return fillFrom(plan, {
    answers: [...state.answers, answer.text],
    waiting: [...waiting, ...found],
    asked,
  });
}

function byteLength(text: string): number {
  return new Blob([text]).size;
}

function charactersIn(answers: readonly string[]): number {
  return answers.reduce((total, answer) => total + answer.length, 0);
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

  if (hidden === null) return null;

  const [, ...later] = await fillFrom(
    { tab, postId: ref.postId, giveUpAt: Date.now() + FILL_DEADLINE_MS },
    { answers: [first.text], waiting: hidden, asked: [] },
  );

  return fitted(tab.url, [first.text, ...later]);
}
