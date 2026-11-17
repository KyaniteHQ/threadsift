import { report } from "./failure-log.ts";
import type { Ports } from "./ports.ts";
import {
  FILL_DEADLINE_MS,
  type TurnRun,
  WAIT_CHECK_MS,
  holdsTurn,
} from "./reddit-account-queue.ts";
import {
  clearRefusals,
  countRefusal,
  expireAccount,
  limitedUntilOf,
  type WindowRecord,
  recordWindow,
  resetAtOf,
  windowRecordOf,
} from "./reddit-account-states.ts";
import { checkSession } from "./reddit-account.ts";
import { type ParsedThread, parseRedditThread } from "./reddit-json.ts";
import { type RedditAnswer, answerOf } from "./reddit-session.ts";
import {
  NEW_WINDOW,
  RATE_LIMITED,
  afterRequest,
  mayAsk,
  pauseForSpacing,
  windowFits,
} from "./reddit-window.ts";
import { REQUEST_DEADLINE_MS } from "./request-waits.ts";
import { THREAD_QUERY, fillAnswers, hiddenIn, permalinkPath } from "./thread-fill.ts";

type RedditRef = import("./links.ts").RedditRef;

export type AccountThread =
  | { readonly kind: "thread"; readonly thread: ParsedThread }
  | { readonly kind: "waiting"; readonly until: number; readonly limited: boolean }
  | { readonly kind: "fallback" };

type FillPorts = Pick<Ports, "db" | "secrets" | "jobs" | "redditSession">;

export interface HeldAccount {
  readonly run: TurnRun;
  readonly session: string;
  readonly sealedSession: string;
  readonly lastRequestAt: number | null;
}

interface Run {
  readonly ports: FillPorts;
  readonly held: Readonly<HeldAccount>;
  readonly ref: Readonly<RedditRef>;
  readonly lastAttempt: boolean;
  readonly deadline: AbortSignal;
  readonly startedAt: number;
  readonly answerFor: (path: string, deadlineMs: number) => Promise<RedditAnswer>;
}

const NO_ANSWER: RedditAnswer = {
  status: 0,
  text: "",
  remaining: null,
  reset: null,
  retryAfter: null,
};

const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 403]);

const FORBIDDEN = 403;

const FALLBACK: AccountThread = { kind: "fallback" };

function firstPathOf({ postId, commentId }: Readonly<RedditRef>): string {
  const target = commentId === undefined ? postId : `${postId}/_/${commentId}`;

  return `/comments/${target}.json?${THREAD_QUERY}`;
}

function logged(
  { startedAt }: Readonly<Run>,
  result: string,
  facts: Readonly<{ requests: number; status: number; left: string | number | null }>,
): void {
  report("reddit-fill", {
    result,
    requests: facts.requests,
    status: facts.status,
    remaining: facts.left ?? -1,
    elapsedMs: Date.now() - startedAt,
  });
}

function holds({ ports, held }: Readonly<Run>): Promise<boolean> {
  return holdsTurn(ports.db, held.run, held);
}

async function record(run: Readonly<Run>, change: Readonly<WindowRecord>): Promise<void> {
  if (await holds(run)) await recordWindow(run.ports.db, run.held, change, Date.now());
}

function recorded(run: Readonly<Run>, answer: Readonly<RedditAnswer>): Promise<void> {
  return record(run, windowRecordOf(answer));
}

function limitedAtFirst(run: Readonly<Run>, first: Readonly<RedditAnswer>): AccountThread {
  const now = Date.now();

  logged(run, "limited", { requests: 1, status: first.status, left: 0 });

  if (run.lastAttempt) return FALLBACK;

  return {
    kind: "waiting",
    until: Math.min(limitedUntilOf(first, now), now + WAIT_CHECK_MS),
    limited: true,
  };
}

async function sessionAnswered(
  run: Readonly<Run>,
  first: Readonly<RedditAnswer>,
  verdict: Awaited<ReturnType<typeof checkSession>>,
): Promise<string> {
  const { ports, held } = run;

  if (verdict.answer !== null) await recorded(run, verdict.answer);

  if (verdict.verdict === "logged-out") {
    await expireAccount(ports, held, Date.now());

    return "logged-out";
  }

  if (verdict.verdict === "ok") {
    await clearRefusals(ports.db, held, Date.now());

    return "refused";
  }

  if (
    verdict.verdict === "blocked" &&
    first.status === FORBIDDEN &&
    verdict.answer?.status === FORBIDDEN
  ) {
    return (await countRefusal(
      ports,
      held,
      { thread: run.ref.postId, startedAt: run.startedAt },
      Date.now(),
    )) === "expired"
      ? "logged-out"
      : "refused";
  }

  return "refused";
}

async function refusedAtFirst(
  run: Readonly<Run>,
  first: Readonly<RedditAnswer>,
): Promise<AccountThread> {
  const budget = afterRequest(NEW_WINDOW, first.remaining);

  if (!mayAsk(budget)) {
    logged(run, "refused", { requests: 1, status: first.status, left: first.remaining });

    return FALLBACK;
  }

  await pauseForSpacing(Date.now());

  if (!(await holds(run))) {
    logged(run, "stopped", { requests: 1, status: first.status, left: first.remaining });

    return FALLBACK;
  }

  const result = await sessionAnswered(
    run,
    first,
    await checkSession(run.ports, run.held.session, run.deadline),
  );

  logged(run, result, { requests: 2, status: first.status, left: first.remaining });

  return FALLBACK;
}

async function waitForWindow(
  run: Readonly<Run>,
  first: Readonly<RedditAnswer>,
): Promise<AccountThread> {
  await record(run, { left: 0, reset: first.reset, retryAfter: null, limited: false });
  logged(run, "budget", { requests: 1, status: first.status, left: first.remaining });

  return { kind: "waiting", until: resetAtOf(first.reset, Date.now()), limited: false };
}

async function filledThread(
  run: Readonly<Run>,
  first: Readonly<RedditAnswer>,
  hidden: readonly string[],
): Promise<AccountThread> {
  const { postId } = run.ref;

  const filled = await fillAnswers(
    run.answerFor,
    { addressFor: (commentId) => permalinkPath(postId, commentId), postId, first, hidden },
    {
      deadlineMs: FILL_DEADLINE_MS,
      signal: run.deadline,
      mayContinue: () => holds(run),
    },
  );

  await record(run, {
    left: filled.window.left,
    reset: filled.last.reset ?? null,
    retryAfter: filled.last.retryAfter ?? null,
    limited: filled.rateLimited,
  });

  const parsed = parseRedditThread(filled.answers, run.ref);

  logged(run, parsed.kind === "thread" ? "filled" : "refused-content", {
    requests: filled.window.sent,
    status: filled.last.status,
    left: filled.window.left,
  });

  return parsed.kind === "thread" ? { kind: "thread", thread: parsed.thread } : FALLBACK;
}

async function afterFirst(
  run: Readonly<Run>,
  first: Readonly<RedditAnswer>,
): Promise<AccountThread> {
  await recorded(run, first);

  if (first.status === RATE_LIMITED) return limitedAtFirst(run, first);

  if (SIGNED_OUT_STATUSES.has(first.status)) return refusedAtFirst(run, first);

  const hidden = hiddenIn(first, run.ref.postId);

  if (hidden === null) {
    logged(run, "failed", { requests: 1, status: first.status, left: first.remaining });

    return FALLBACK;
  }

  await clearRefusals(run.ports.db, run.held, Date.now());

  return windowFits(first.remaining, hidden)
    ? filledThread(run, first, hidden)
    : waitForWindow(run, first);
}

export async function accountThread(
  ports: Readonly<FillPorts>,
  held: Readonly<HeldAccount>,
  ref: Readonly<RedditRef>,
  { lastAttempt, deadline }: Readonly<{ lastAttempt: boolean; deadline: AbortSignal }>,
): Promise<AccountThread> {
  const answerFor = async (path: string, deadlineMs: number): Promise<RedditAnswer> => {
    try {
      return await answerOf(
        await ports.redditSession.get(
          path,
          held.session,
          AbortSignal.any([deadline, AbortSignal.timeout(deadlineMs)]),
        ),
      );
    } catch {
      return NO_ANSWER;
    }
  };

  const run: Run = { ports, held, ref, lastAttempt, deadline, startedAt: Date.now(), answerFor };

  await pauseForSpacing(held.lastRequestAt);

  if (!(await holds(run))) return FALLBACK;

  return afterFirst(run, await answerFor(firstPathOf(ref), REQUEST_DEADLINE_MS));
}
