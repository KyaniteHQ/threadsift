import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { BlankEnv } from "hono/types";

import type { Scope } from "../core/contract/agent-token-contract.ts";
import { groupedNumber } from "../core/contract/format.ts";
import {
  REDDIT_SESSION_MAX,
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditSessionInputSchema,
  RedditVerifySchema,
} from "../core/contract/reddit-account-contract.ts";
import type { Ports } from "../core/kernel/ports.ts";
import {
  connectRedditAccount,
  disconnectRedditAccount,
  redditAccountState,
  savedAnswer,
  verifyRedditAccount,
} from "../core/reddit/reddit-account.ts";
import { type Gate, access } from "./access.ts";
import { jsonBody, jsonRequest, scopeNote, scopeRefusal } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const SETTINGS_PATH = "/api/settings/reddit-account";

const TOKEN_PATH = "/api/reddit-account";

const OWNER_ONLY_TEXT =
  "The caller is an agent token, which this route refuses. It is for the signed-in owner.";

type AccountGate = Gate<BlankEnv, "owner"> | Gate<BlankEnv, Scope>;

interface Account {
  readonly path: string;
  readonly get: AccountGate;
  readonly put: AccountGate;
  readonly delete: AccountGate;
}

const noteOf = (gate: AccountGate): string => (gate.who === "owner" ? "" : scopeNote(gate));

const refusalOf = (gate: AccountGate) =>
  gate.who === "owner"
    ? { 403: jsonBody(ErrorResponseSchema, OWNER_ONLY_TEXT) }
    : scopeRefusal(gate);

const READ_TEXT =
  "Whether a Reddit account is connected (`connected`), no longer accepted by Reddit (`expired`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`), and `secretReady`, whether it has one. The session is never returned.";

const REMOVE_TEXT =
  "The state after the account is removed. Every fetch that waits for the account runs at once, through the archive. Removing when none is set also succeeds.";

const viewRoute = (
  method: "get" | "delete",
  path: string,
  gate: AccountGate,
  { text, summary }: Readonly<{ text: string; summary: string }>,
) =>
  createRoute({
    method,
    path,
    middleware: gate,
    description: `${summary}${noteOf(gate)}`,
    responses: {
      ...refusalOf(gate),
      200: jsonBody(RedditAccountViewSchema, text),
    },
  });

const saveRoute = (path: string, gate: AccountGate) =>
  createRoute({
    method: "put",
    path,
    middleware: gate,
    description: `Connect the Reddit account with a session.${noteOf(gate)}`,
    request: { body: jsonRequest(RedditSessionInputSchema) },
    responses: {
      ...refusalOf(gate),
      200: jsonBody(
        RedditAccountSaveResponseSchema,
        "The state after the save, `connected`, or the refusal `secret-missing` when this Instance has no sealing key. Nothing is sent to Reddit.",
      ),
      400: jsonBody(
        ErrorResponseSchema,
        `The session is not 1 to ${groupedNumber(REDDIT_SESSION_MAX)} characters of letters, digits and \`. _ ~ + / = % -\`, with at most one leading \`reddit_session=\`. Nothing is saved.`,
      ),
    },
  });

const verifyRoute = createRoute({
  method: "post",
  path: `${SETTINGS_PATH}/verify`,
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      RedditVerifySchema,
      "What one request to Reddit's `me.json` got back with the saved session: `ok`, `logged-out` (HTTP 401, or an answer that names no account), `blocked` (any other status), `limited` (429), `unreachable`, `timeout`, `not-configured`, `secret-missing` or `unreadable`. Reddit's own 401 is a result inside this 200, so it never signs the owner out. `logged-out` sets the state `expired` and `ok` sets it `connected`.",
    ),
  },
});

function registerAccountRoutes(app: OpenAPIHono, ports: Ports, account: Readonly<Account>): void {
  const { path } = account;

  app.openapi(
    viewRoute("get", path, account.get, {
      summary: "Read the Reddit account's state.",
      text: READ_TEXT,
    }),
    async (c) => c.json(await redditAccountState(ports), 200),
  );
  app.openapi(saveRoute(path, account.put), async (c) => {
    const answer = savedAnswer(await connectRedditAccount(ports, c.req.valid("json").session));

    return answer.status === 200 ? c.json(answer.body, 200) : c.json(answer.body, 400);
  });
  app.openapi(
    viewRoute("delete", path, account.delete, {
      summary: "Remove the Reddit account.",
      text: REMOVE_TEXT,
    }),
    async (c) => c.json(await disconnectRedditAccount(ports), 200),
  );
}

const OWNER = access("owner");

const OWNER_ACCOUNT: Account = { path: SETTINGS_PATH, get: OWNER, put: OWNER, delete: OWNER };

const TOKEN_ACCOUNT: Account = {
  path: TOKEN_PATH,
  get: access("read"),
  put: access("reddit"),
  delete: access("reddit"),
};

export function registerRedditAccountRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAccountRoutes(app, ports, OWNER_ACCOUNT);
  registerAccountRoutes(app, ports, TOKEN_ACCOUNT);
  app.openapi(verifyRoute, async (c) =>
    c.json({ result: await verifyRedditAccount(ports, c.req.raw.signal) }, 200),
  );
}
