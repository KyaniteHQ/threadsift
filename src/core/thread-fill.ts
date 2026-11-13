import { ITEM_REQUEST_BYTES } from "./limits.ts";
import { pause } from "./pause.ts";
import { hiddenRepliesOf } from "./reddit-tree.ts";
import {
  NEW_WINDOW,
  REQUEST_SPACING_MS,
  type RequestWindow,
  afterRequest,
  mayAsk,
} from "./reddit-window.ts";
import type { ThreadAnswers } from "./thread-answers.ts";

export const THREAD_QUERY = "limit=500&raw_json=1";

export const RATE_LIMITED = 429;

export const REQUEST_DEADLINE_MS = 15_000;

export interface FillAnswer {
  readonly status: number;
  readonly text: string;
  readonly remaining: string | null;
  readonly reset?: string | null | undefined;
  readonly retryAfter?: string | null | undefined;
}

export type AnswerFor = (address: string, deadlineMs: number) => Promise<FillAnswer>;

export interface FillStart {
  readonly addressFor: (commentId: string) => string;
  readonly postId: string;
  readonly first: Readonly<FillAnswer>;
  readonly hidden: readonly string[];
}

export interface FillLimits {
  readonly deadlineMs: number;
  readonly signal?: AbortSignal | undefined;
  readonly mayContinue?: (() => Promise<boolean>) | undefined;
}

export interface Filled {
  readonly answers: ThreadAnswers;
  readonly window: RequestWindow;
  readonly rateLimited: boolean;
  readonly last: Readonly<FillAnswer>;
}

export function permalinkPath(postId: string, commentId: string): string {
  return `/comments/${postId}/_/${commentId}.json?${THREAD_QUERY}`;
}

export function hiddenIn(first: Readonly<FillAnswer>, postId: string): readonly string[] | null {
  return first.status === 200 ? hiddenRepliesOf(first.text, postId) : null;
}

function stopped(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function spacingWait(startedAt: number): number {
  return Math.max(0, REQUEST_SPACING_MS - (Date.now() - startedAt));
}

function withinLimits(
  window: Readonly<RequestWindow>,
  held: number,
  giveUpAt: number,
  signal: AbortSignal | undefined,
): boolean {
  return mayAsk(window) && Date.now() < giveUpAt && held <= ITEM_REQUEST_BYTES && !stopped(signal);
}

async function answerAfter(
  answerFor: AnswerFor,
  address: string,
  {
    wait,
    giveUpAt,
    mayContinue,
  }: Readonly<{
    wait: number;
    giveUpAt: number;
    mayContinue: FillLimits["mayContinue"];
  }>,
): Promise<FillAnswer | null> {
  await pause(wait);

  const left = giveUpAt - Date.now();

  if (left <= 0 || (mayContinue !== undefined && !(await mayContinue()))) return null;

  return answerFor(address, Math.min(REQUEST_DEADLINE_MS, left));
}

export async function fillAnswers(
  answerFor: AnswerFor,
  { addressFor, postId, first, hidden }: Readonly<FillStart>,
  { deadlineMs, signal, mayContinue }: Readonly<FillLimits>,
): Promise<Filled> {
  const answers: [string, ...string[]] = [first.text];
  const queue = [...hidden];
  const asked = new Set<string>();
  const giveUpAt = Date.now() + deadlineMs;
  let window = afterRequest(NEW_WINDOW, first.remaining);
  let [held, startedAt, last] = [first.text.length, Date.now(), first];
  let rateLimited = false;

  for (const id of queue) {
    if (!withinLimits(window, held, giveUpAt, signal)) break;

    if (asked.has(id)) continue;

    asked.add(id);

    const wait = spacingWait(startedAt);
    startedAt = Date.now() + wait;

    const address = addressFor(id);

    // oxlint-disable-next-line eslint/no-await-in-loop -- the requests are sequential and spaced.
    const answer = await answerAfter(answerFor, address, { wait, giveUpAt, mayContinue });

    if (answer === null) break;

    window = afterRequest(window, answer.remaining);
    last = answer;

    if (answer.status === RATE_LIMITED) {
      rateLimited = true;
      break;
    }

    const found = hiddenIn(answer, postId);

    if (found === null) continue;

    answers.push(answer.text);
    queue.push(...found);
    held += answer.text.length;
  }

  return { answers, window, rateLimited, last };
}
