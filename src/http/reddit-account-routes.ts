import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Ports } from "../core/ports.ts";
import {
  RedditAccountSaveResponseSchema,
  RedditAccountViewSchema,
  RedditSessionInputSchema,
  RedditVerifySchema,
} from "../core/reddit-account-contract.ts";
import {
  connectRedditAccount,
  disconnectRedditAccount,
  redditAccountState,
  savedAnswer,
  verifyRedditAccount,
} from "../core/reddit-account.ts";
import { jsonBody, jsonRequest, scopeNote, scopeRefusal } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const SETTINGS_PATH = "/api/settings/reddit-account";

const TOKEN_PATH = "/api/reddit-account";

const OWNER_ONLY_TEXT =
  "The caller is an agent token, which this route refuses. It is for the signed-in owner.";

const noteOf = (method: string, path: string, scoped: boolean): string =>
  scoped ? scopeNote(method, path) : "";

const refusalOf = (method: string, path: string, scoped: boolean) =>
  scoped ? scopeRefusal(method, path) : { 403: jsonBody(ErrorResponseSchema, OWNER_ONLY_TEXT) };

const READ_TEXT =
  "Whether a Reddit account is connected (`connected`), no longer accepted by Reddit (`expired`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`), and `secretReady`, whether it has one. The session is never returned.";

const REMOVE_TEXT =
  "The state after the account is removed. Every fetch that waits for the account runs at once, through the archive. Removing when none is set also succeeds.";

const viewRoute = (
  method: "get" | "delete",
  { path, scoped }: Readonly<{ path: string; scoped: boolean }>,
  { text, summary }: Readonly<{ text: string; summary: string }>,
) =>
  createRoute({
    method,
    path,
    description: `${summary}${noteOf(method.toUpperCase(), path, scoped)}`,
    responses: {
      ...refusalOf(method.toUpperCase(), path, scoped),
      200: jsonBody(RedditAccountViewSchema, text),
    },
  });

const saveRoute = ({ path, scoped }: Readonly<{ path: string; scoped: boolean }>) =>
  createRoute({
    method: "put",
    path,
    description: `Connect the Reddit account with a session.${noteOf("PUT", path, scoped)}`,
    request: { body: jsonRequest(RedditSessionInputSchema) },
    responses: {
      ...refusalOf("PUT", path, scoped),
      200: jsonBody(
        RedditAccountSaveResponseSchema,
        "The state after the save, `connected`, or the refusal `secret-missing` when this Instance has no sealing key. Nothing is sent to Reddit.",
      ),
      400: jsonBody(
        ErrorResponseSchema,
        "The session is not 1 to 4,096 characters of letters, digits and `. _ ~ + / = % -`, with at most one leading `reddit_session=`. Nothing is saved.",
      ),
    },
  });

const verifyRoute = createRoute({
  method: "post",
  path: `${SETTINGS_PATH}/verify`,
  responses: {
    200: jsonBody(
      RedditVerifySchema,
      "What one request to Reddit's `me.json` got back with the saved session: `ok`, `logged-out` (HTTP 401, or an answer that names no account), `blocked` (any other status), `limited` (429), `unreachable`, `timeout`, `not-configured`, `secret-missing` or `unreadable`. Reddit's own 401 is a result inside this 200, so it never signs the owner out. `logged-out` sets the state `expired` and `ok` sets it `connected`.",
    ),
  },
});

function registerAccountRoutes(
  app: OpenAPIHono,
  ports: Ports,
  where: Readonly<{ path: string; scoped: boolean }>,
): void {
  app.openapi(
    viewRoute("get", where, { summary: "Read the Reddit account's state.", text: READ_TEXT }),
    async (c) => c.json(await redditAccountState(ports), 200),
  );
  app.openapi(saveRoute(where), async (c) => {
    const answer = savedAnswer(await connectRedditAccount(ports, c.req.valid("json").session));

    return answer.status === 200 ? c.json(answer.body, 200) : c.json(answer.body, 400);
  });
  app.openapi(
    viewRoute("delete", where, { summary: "Remove the Reddit account.", text: REMOVE_TEXT }),
    async (c) => c.json(await disconnectRedditAccount(ports), 200),
  );
}

export function registerRedditAccountRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAccountRoutes(app, ports, { path: SETTINGS_PATH, scoped: false });
  registerAccountRoutes(app, ports, { path: TOKEN_PATH, scoped: true });
  app.openapi(verifyRoute, async (c) =>
    c.json({ result: await verifyRedditAccount(ports, c.req.raw.signal) }, 200),
  );
}
