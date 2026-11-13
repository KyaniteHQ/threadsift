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
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/reddit-account",
  responses: {
    200: jsonBody(
      RedditAccountViewSchema,
      "Whether a Reddit account is connected (`connected`), no longer accepted by Reddit (`expired`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`), and `secretReady`, whether it has one. The session is never returned.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/reddit-account",
  request: { body: jsonRequest(RedditSessionInputSchema) },
  responses: {
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
  path: "/api/settings/reddit-account/verify",
  responses: {
    200: jsonBody(
      RedditVerifySchema,
      "What one request to Reddit's `me.json` got back with the saved session: `ok`, `logged-out` (HTTP 401, or an answer that names no account), `blocked` (any other status), `limited` (429), `unreachable`, `timeout`, `not-configured`, `secret-missing` or `unreadable`. Reddit's own 401 is a result inside this 200, so it never signs the owner out. `logged-out` sets the state `expired` and `ok` sets it `connected`.",
    ),
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: "/api/settings/reddit-account",
  responses: {
    200: jsonBody(
      RedditAccountViewSchema,
      "The state after the account is removed. Every fetch that waits for the account runs at once, through the archive. Removing when none is set also succeeds.",
    ),
  },
});

export function registerRedditAccountRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await redditAccountState(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const answer = savedAnswer(await connectRedditAccount(ports, c.req.valid("json").session));

    return answer.status === 200 ? c.json(answer.body, 200) : c.json(answer.body, 400);
  });
  app.openapi(verifyRoute, async (c) =>
    c.json({ result: await verifyRedditAccount(ports, c.req.raw.signal) }, 200),
  );
  app.openapi(removeRoute, async (c) => c.json(await disconnectRedditAccount(ports), 200));
}
