import { browser } from "wxt/browser";

import { RedditAccountSaveResponseSchema } from "../../src/core/reddit-account-contract.ts";
import type { RedditConnectState } from "../../src/core/reddit-relay-contract.ts";
import { exclusive, reconcileAccess } from "./access.ts";
import { type Config, holdsInstanceAccess, holdsRedditConnect, instanceRequest } from "./config.ts";
import { logFailure } from "./log.ts";

const COOKIE = { url: "https://www.reddit.com/", name: "reddit_session" };

const FIRST_PARTY_ANY = import.meta.env.FIREFOX ? { firstPartyDomain: null } : {};

async function stateOf(response: Response): Promise<RedditConnectState> {
  switch (response.status) {
    case 200: {
      const answer = RedditAccountSaveResponseSchema.safeParse(
        await response.json().catch(() => null),
      );

      if (!answer.success) return "failed";

      return "kind" in answer.data ? "missing" : answer.data.state;
    }

    case 401:
      return "token-refused";
    case 403:
      return "scope-refused";
    case 404:
      return "unavailable";
    default:
      return "failed";
  }
}

async function call(
  config: Readonly<Config>,
  request: Readonly<{ method: "GET" | "PUT" | "DELETE"; body?: { readonly session: string } }>,
): Promise<RedditConnectState> {
  try {
    return await stateOf(await instanceRequest(config, "/api/reddit-account", request));
  } catch {
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

export async function connectReddit(config: Readonly<Config> | null): Promise<RedditConnectState> {
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

export async function disconnectReddit(
  config: Readonly<Config> | null,
): Promise<RedditConnectState> {
  const state = config === null ? "none" : await call(config, { method: "DELETE" });

  return state === "none" || state === "missing" ? exclusive(() => giveBackCookies(state)) : state;
}
