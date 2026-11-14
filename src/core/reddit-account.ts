import { z } from "zod";

import type { Ports } from "./ports.ts";
import {
  REDDIT_SESSION_INVALID,
  type RedditAccountView,
  type RedditVerifyResult,
  redditSessionOf,
} from "./reddit-account-contract.ts";
import {
  accountRow,
  clearRefusals,
  connectAccount,
  disconnectAccount,
  expireAccount,
  recordWindow,
  restoreAccount,
} from "./reddit-account-states.ts";
import { type AccountRow } from "./reddit-account-tables.ts";
import { type RedditAnswer, answerOf } from "./reddit-session.ts";
import { leftOf } from "./reddit-window.ts";
import { REQUEST_DEADLINE_MS } from "./thread-fill.ts";

type AccountPorts = Pick<Ports, "db" | "secrets">;

type DisconnectPorts = AccountPorts & Pick<Ports, "jobs">;

type VerifyPorts = DisconnectPorts & Pick<Ports, "redditSession">;

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

const LOGGED_OUT = 401;

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
  ports: Readonly<AccountPorts>,
  text: string,
): Promise<ConnectOutcome> {
  const session = redditSessionOf(text);

  if (session === null) return { kind: "invalid", error: REDDIT_SESSION_INVALID };

  if (ports.secrets === null) return { kind: "refused", reason: "secret-missing" };

  await connectAccount(ports.db, await ports.secrets.seal(session), Date.now());

  return { kind: "connected", view: await redditAccountState(ports) };
}

export async function disconnectRedditAccount(
  ports: Readonly<DisconnectPorts>,
): Promise<RedditAccountView> {
  await disconnectAccount(ports, Date.now());

  return redditAccountState(ports);
}

export function verdictOf(answer: Readonly<Pick<RedditAnswer, "status" | "text">>): SessionVerdict {
  if (answer.status === 429) return "limited";

  if (answer.status === LOGGED_OUT) return "logged-out";

  if (answer.status !== 200) return "blocked";

  try {
    return MeSchema.safeParse(JSON.parse(answer.text)).success ? "ok" : "logged-out";
  } catch {
    return "blocked";
  }
}

export async function checkSession(
  { redditSession }: Readonly<Pick<Ports, "redditSession">>,
  cookie: string,
  signal: AbortSignal | undefined,
): Promise<SessionCheck> {
  const deadline = AbortSignal.timeout(REQUEST_DEADLINE_MS);

  try {
    const answer = await answerOf(
      await redditSession.get(
        ME_PATH,
        cookie,
        signal === undefined ? deadline : AbortSignal.any([signal, deadline]),
      ),
    );

    return { verdict: verdictOf(answer), answer };
  } catch {
    return { verdict: deadline.aborted ? "timeout" : "unreachable", answer: null };
  }
}

export async function verifyRedditAccount(
  ports: Readonly<VerifyPorts>,
  signal: AbortSignal,
): Promise<RedditVerifyResult> {
  const { db, secrets } = ports;

  if (secrets === null) return "secret-missing";

  const row = await accountRow(db);

  if (row === null) return "not-configured";

  const session = await openedSession(secrets, row);

  if (session === null) return "unreadable";

  const { verdict, answer } = await checkSession(ports, session, signal);

  await settledVerdict(ports, verdict, answer);

  return verdict;
}

async function settledVerdict(
  ports: Readonly<VerifyPorts>,
  verdict: SessionVerdict,
  answer: Readonly<RedditAnswer> | null,
): Promise<void> {
  const now = Date.now();

  if (answer !== null) {
    await recordWindow(
      ports.db,
      {
        left: leftOf(answer.remaining),
        reset: answer.reset,
        retryAfter: answer.retryAfter,
        limited: verdict === "limited",
      },
      now,
    );
  }

  if (verdict === "logged-out") await expireAccount(ports, now);

  if (verdict === "ok") {
    await restoreAccount(ports.db, now);
    await clearRefusals(ports.db);
  }
}
