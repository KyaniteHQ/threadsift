import type {
  RedditAccountView,
  RedditVerifyResult,
} from "../../src/core/reddit-account-contract.ts";
import type { RedditConnectState } from "../../src/core/reddit-relay-contract.ts";
import { AI_TEXT } from "./ai-text.ts";

export const REDDIT_ACCOUNT_GUIDE_URL =
  "https://github.com/KyaniteHQ/threadsift/blob/main/docs/guides/reddit-account.md";

export const REDDIT_ACCOUNT_TEXT = {
  sectionTitle: "Reddit account",
  intro:
    "Connect your Reddit account to read Reddit links directly when they arrive without the Extension. Use a separate Reddit account, because Reddit’s User Agreement forbids scraping without written consent and the requests use your own session.",
  guideLink: "How to find your session",
  fieldLabel: "Session cookie",
  fieldHelp:
    "Paste the value of the reddit_session cookie, with or without the reddit_session= prefix. It is kept sealed on this Instance, sent only to reddit.com, and never shown again.",
  fieldPlaceholder: "Session saved",
  stateNone: "No Reddit account is connected. Reddit links are filled from the archive.",
  stateConnected:
    "Every Reddit link, an Import’s included, is read one at a time with this account.",
  stateExpired:
    "Reddit stopped accepting the session. Connect again; links are filled from the archive until then.",
  stateUnreadable:
    "This Instance can no longer open the saved session because its secret key changed. Connect again.",
  connect: "Connect",
  connecting: "Connecting…",
  verify: "Verify",
  verifying: "Verifying…",
  disconnect: "Disconnect",
  disconnecting: "Disconnecting…",
  connected: "Reddit account connected.",
  disconnected: "Reddit account disconnected.",
  valueNeeded: "Enter a session cookie to connect.",
  invalidValue:
    "Enter 1 to 4,096 characters using only letters, digits and . _ ~ + / = % -, with no spaces, semicolons or line breaks.",
  resultOk: "Reddit accepted the session.",
  resultLoggedOut: "Reddit says the session is logged out. Connect again with a new value.",
  resultBlocked:
    "Reddit refused this request, which does not by itself mean the session is dead. Try again later.",
  resultLimited: "Reddit is limiting requests, so try again in a few minutes.",
  resultUnreachable: "Reddit did not answer. Try again.",
  resultTimeout: "Reddit did not answer in 15 seconds. Try again.",
  resultNotConfigured: "Connect a Reddit account first, then press Verify.",
  reconnectExtension: "Reconnect with the Extension",
  reconnectingExtension: "Reconnecting with the Extension…",
  extensionMissing:
    "The Extension did not answer. Use the Extension’s Connect Reddit button, or paste the cookie value in the field above.",
  extensionNoAccess:
    "The Extension has no access to cookies and reddit.com. Press Connect Reddit once in the Extension’s settings page.",
  extensionSignedOut: "Your browser isn’t signed in to Reddit. Sign in and try again.",
  extensionScopeRefused:
    "The Extension’s agent token lacks the Reddit scope. Make a new agent token with the Reddit scope under Agent tokens above and enter it in the Extension’s settings.",
  extensionTokenRefused:
    "The Extension’s agent token is wrong or was revoked. Check it in the Extension’s settings.",
  extensionUnreachable:
    "The Extension couldn’t reach this Instance. Check the address in the Extension’s settings.",
  extensionFailed: "Couldn’t reconnect with the Extension. Try again.",
  loadFailed: "Couldn’t load the Reddit account settings. Reload the page.",
  failed: "Couldn’t connect, verify or disconnect the Reddit account. Try again.",
} as const;

const STATE_TEXT = {
  none: REDDIT_ACCOUNT_TEXT.stateNone,
  connected: REDDIT_ACCOUNT_TEXT.stateConnected,
  expired: REDDIT_ACCOUNT_TEXT.stateExpired,
  unreadable: REDDIT_ACCOUNT_TEXT.stateUnreadable,
  missing: AI_TEXT["secret-missing"],
} as const satisfies Record<RedditAccountView["state"], string>;

const RESULT_TEXT = {
  ok: REDDIT_ACCOUNT_TEXT.resultOk,
  "logged-out": REDDIT_ACCOUNT_TEXT.resultLoggedOut,
  blocked: REDDIT_ACCOUNT_TEXT.resultBlocked,
  limited: REDDIT_ACCOUNT_TEXT.resultLimited,
  unreachable: REDDIT_ACCOUNT_TEXT.resultUnreachable,
  timeout: REDDIT_ACCOUNT_TEXT.resultTimeout,
  "not-configured": REDDIT_ACCOUNT_TEXT.resultNotConfigured,
  "secret-missing": AI_TEXT["secret-missing"],
  unreadable: REDDIT_ACCOUNT_TEXT.stateUnreadable,
} as const satisfies Record<RedditVerifyResult, string>;

const RELAY_TEXT = {
  connected: REDDIT_ACCOUNT_TEXT.connected,
  unavailable: REDDIT_ACCOUNT_TEXT.extensionFailed,
  none: REDDIT_ACCOUNT_TEXT.extensionFailed,
  expired: REDDIT_ACCOUNT_TEXT.extensionFailed,
  unreadable: REDDIT_ACCOUNT_TEXT.extensionFailed,
  missing: AI_TEXT["secret-missing"],
  "no-access": REDDIT_ACCOUNT_TEXT.extensionNoAccess,
  "signed-out": REDDIT_ACCOUNT_TEXT.extensionSignedOut,
  "scope-refused": REDDIT_ACCOUNT_TEXT.extensionScopeRefused,
  "token-refused": REDDIT_ACCOUNT_TEXT.extensionTokenRefused,
  unreachable: REDDIT_ACCOUNT_TEXT.extensionUnreachable,
  failed: REDDIT_ACCOUNT_TEXT.extensionFailed,
  "access-kept": REDDIT_ACCOUNT_TEXT.extensionFailed,
} as const satisfies Record<RedditConnectState, string>;

export function relayText(state: RedditConnectState): string {
  return RELAY_TEXT[state];
}

export function stateText(state: RedditAccountView["state"]): string {
  return STATE_TEXT[state];
}

export function resultText(result: RedditVerifyResult): string {
  return RESULT_TEXT[result];
}
