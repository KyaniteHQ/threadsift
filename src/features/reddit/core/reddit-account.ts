import { z } from "zod";

import { within } from "../../../core/contract/deadline.ts";
import {
  REDDIT_SESSION_INVALID,
  type RedditAccountView,
  type RedditVerifyResult,
  redditSessionOf,
} from "../../../core/contract/reddit-account-contract.ts";
import {
  LOGGED_OUT,
  OK,
  RATE_LIMITED,
  type RedditAnswer,
} from "../../../core/contract/reddit-http.ts";
import { REQUEST_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import type { AccountRow } from "../../../core/kernel/reddit-account-tables.ts";
import {
  type AccountSession,
  type AnswerOf,
  accountRow,
  confirmAccount,
  connectAccount,
  disconnectAccount,
  expireAccount,
  recordWindow,
  windowRecordOf,
} from "./reddit-account-states.ts";
import { answerOf, redditSessionGet } from "./reddit-session.ts";

type AccountPorts = Pick<Ports, "db" | "secrets">;

type ChangePorts = AccountPorts & Pick<Ports, "jobs">;

type ConnectOutcome =
  | { readonly kind: "connected"; readonly view: RedditAccountView }
  | { readonly kind: "refused"; readonly reason: "secret-missing" }
  | { readonly kind: "invalid"; readonly error: string };

type SessionVerdict = Exclude<
  RedditVerifyResult,
  "not-configured" | "secret-missing" | "unreadable"
>;

export interface SessionCheck {
  readonly verdict: SessionVerdict;
  readonly answer: RedditAnswer | null;
}

const ME_PATH = "/api/me.json";

const MeSchema = z.object({ kind: z.literal("t2"), data: z.object({ name: z.string() }) });

function viewOf(
  secrets: AccountPorts["secrets"],
  row: Readonly<AccountRow> | null,
  session: string | null,
): RedditAccountView {
  const secretReady = secrets !== null;

  if (!secretReady) return { state: "missing", secretReady };

  if (row === null) return { state: "none", secretReady };

  return { state: session === null ? "unreadable" : row.state, secretReady };
}

export function openedSession(
  secrets: AccountPorts["secrets"],
  row: Readonly<AccountRow> | null,
): Promise<string | null> {
  return row === null || secrets === null ? Promise.resolve(null) : secrets.open(row.sealedSession);
}

export async function redditAccountState({
  db,
  secrets,
}: Readonly<AccountPorts>): Promise<RedditAccountView> {
  const row = await accountRow(db);

  return viewOf(secrets, row, await openedSession(secrets, row));
}

export function savedAnswer(saved: Readonly<ConnectOutcome>):
  | {
      readonly status: 200;
      readonly body:
        | RedditAccountView
        | { readonly kind: "refused"; readonly reason: "secret-missing" };
    }
  | { readonly status: 400; readonly body: { readonly error: string } } {
  switch (saved.kind) {
    case "connected":
      return { status: 200, body: saved.view };
    case "refused":
      return { status: 200, body: { kind: "refused", reason: saved.reason } };
    case "invalid":
      return { status: 400, body: { error: saved.error } };
    default: {
      const exhaustive: never = saved;

      return exhaustive;
    }
  }
}

export async function connectRedditAccount(
  ports: Readonly<ChangePorts>,
  text: string,
): Promise<ConnectOutcome> {
  const session = redditSessionOf(text);

  if (session === null) return { kind: "invalid", error: REDDIT_SESSION_INVALID };

  if (ports.secrets === null) return { kind: "refused", reason: "secret-missing" };

  await connectAccount(ports, await ports.secrets.seal(session), Date.now());

  return { kind: "connected", view: await redditAccountState(ports) };
}

export async function disconnectRedditAccount(
  ports: Readonly<ChangePorts>,
): Promise<RedditAccountView> {
  await disconnectAccount(ports, Date.now());

  return redditAccountState(ports);
}

function verdictOf(answer: Readonly<Pick<RedditAnswer, "status" | "text">>): SessionVerdict {
  if (answer.status === RATE_LIMITED) return "limited";

  if (answer.status === LOGGED_OUT) return "logged-out";

  if (answer.status !== OK) return "blocked";

  try {
    return MeSchema.safeParse(JSON.parse(answer.text)).success ? "ok" : "logged-out";
  } catch {
    return "blocked";
  }
}

export async function checkSession(
  cookie: string,
  signal: AbortSignal | undefined,
): Promise<SessionCheck> {
  const deadline = AbortSignal.timeout(REQUEST_DEADLINE_MS);

  try {
    const answer = await answerOf(
      await redditSessionGet(ME_PATH, cookie, within(signal, deadline)),
    );

    return { verdict: verdictOf(answer), answer };
  } catch {
    return { verdict: deadline.aborted ? "timeout" : "unreachable", answer: null };
  }
}

export async function verifyRedditAccount(
  ports: Readonly<ChangePorts>,
  signal: AbortSignal,
): Promise<RedditVerifyResult> {
  const { db, secrets } = ports;

  if (secrets === null) return "secret-missing";

  const row = await accountRow(db);

  if (row === null) return "not-configured";

  const session = await openedSession(secrets, row);

  if (session === null) return "unreadable";

  const request = { startedAt: Date.now() };

  const check = await checkSession(session, signal);

  await settledVerdict(ports, row, request, check);

  return storedVerdict(check.verdict, await accountRow(db));
}

function storedVerdict(
  verdict: SessionVerdict,
  stored: Readonly<AccountRow> | null,
): RedditVerifyResult {
  if (verdict !== "ok" && verdict !== "logged-out") return verdict;

  if (stored === null) return "not-configured";

  return stored.state === "connected" ? "ok" : "logged-out";
}

async function settledVerdict(
  ports: Readonly<ChangePorts>,
  session: AccountSession,
  request: Readonly<AnswerOf>,
  { verdict, answer }: Readonly<SessionCheck>,
): Promise<void> {
  const now = Date.now();

  if (answer !== null) {
    await recordWindow(ports.db, session, windowRecordOf(answer), now);
  }

  if (verdict === "logged-out") await expireAccount(ports, session, request, now);

  if (verdict === "ok") await confirmAccount(ports.db, session, request, now);
}
