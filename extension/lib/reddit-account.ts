import { browser } from "wxt/browser";
import type { z } from "zod";

import {
  REDDIT_SESSION_COOKIE,
  RedditAccountSaveResponseSchema,
  type RedditSessionInputSchema,
} from "../../src/core/contract/reddit-account-contract.ts";
import type { RedditConnectState } from "../../src/core/contract/reddit-relay-contract.ts";
import { exclusive, reconcileAccess } from "./access.ts";
import {
  type Config,
  holdsInstanceAccess,
  holdsRedditConnect,
  instanceAnswer,
  instanceRequest,
} from "./config.ts";
import { logFailure, logRequestFailure } from "./log.ts";
import { oneAtATime } from "./one-at-a-time.ts";

const accountWrites = oneAtATime();

const COOKIE = { url: "https://www.reddit.com/", name: REDDIT_SESSION_COOKIE };

const FIRST_PARTY_ANY = import.meta.env.FIREFOX ? { firstPartyDomain: null } : {};

async function stateOf(response: Response): Promise<RedditConnectState> {
  switch (response.status) {
    case 200: {
      const answer = await instanceAnswer(response, RedditAccountSaveResponseSchema);

      if (answer === null) return "failed";

      return "kind" in answer ? "missing" : answer.state;
    }

    case 401:
      return "token-refused";
    case 403:
      return "scope-refused";
    default:
      return "failed";
  }
}

async function call(
  config: Readonly<Config>,
  request: Readonly<{
    method: "GET" | "PUT" | "DELETE";
    body?: z.input<typeof RedditSessionInputSchema>;
  }>,
): Promise<RedditConnectState> {
  try {
    return await stateOf(await instanceRequest(config, "/api/reddit-account", request));
  } catch (cause) {
    logRequestFailure("reddit-account-request-failed", cause);

    return "unreachable";
  }
}

type Cookie = { readonly value: string } | { readonly state: "signed-out" | "failed" };

async function sessionCookie(): Promise<Cookie> {
  try {
    const found = await browser.cookies.getAll({ ...COOKIE, ...FIRST_PARTY_ANY });
    const [only] = found;

    if (found.length === 0) return { state: "signed-out" };

    return found.length === 1 && only !== undefined ? { value: only.value } : { state: "failed" };
  } catch (cause) {
    logFailure("reddit-cookie-failed", cause);

    return { state: "failed" };
  }
}

export function readRedditState(config: Readonly<Config> | null): Promise<RedditConnectState> {
  return config === null ? Promise.resolve("unavailable") : call(config, { method: "GET" });
}

async function connectNow(config: Readonly<Config> | null): Promise<RedditConnectState> {
  if (config === null) return "unavailable";

  if (!(await holdsRedditConnect()) || !(await holdsInstanceAccess(config.origin))) {
    return "no-access";
  }

  const cookie = await sessionCookie();

  return "value" in cookie
    ? call(config, { method: "PUT", body: { session: cookie.value } })
    : cookie.state;
}

async function giveBackCookies(state: RedditConnectState): Promise<RedditConnectState> {
  try {
    await browser.permissions.remove({ permissions: ["cookies"] });
  } catch (cause) {
    logFailure("reddit-permission-remove-failed", cause);
  }

  await reconcileAccess();

  return (await browser.permissions.contains({ permissions: ["cookies"] })) ? "access-kept" : state;
}

async function disconnectNow(config: Readonly<Config> | null): Promise<RedditConnectState> {
  const state = config === null ? "none" : await call(config, { method: "DELETE" });

  return state === "none" || state === "missing" ? exclusive(() => giveBackCookies(state)) : state;
}

export function connectReddit(config: Readonly<Config> | null): Promise<RedditConnectState> {
  return accountWrites(() => connectNow(config));
}

export function disconnectReddit(config: Readonly<Config> | null): Promise<RedditConnectState> {
  return accountWrites(() => disconnectNow(config));
}
