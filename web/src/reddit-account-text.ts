import { groupedNumber } from "../../src/core/contract/format.ts";
import {
  REDDIT_SESSION_MAX,
  type RedditAccountView,
  type RedditVerifyResult,
} from "../../src/core/contract/reddit-account-contract.ts";
import type { RedditConnectState } from "../../src/core/contract/reddit-relay-contract.ts";
import { REQUEST_DEADLINE_MS } from "../../src/core/contract/request-waits.ts";
import { SECOND_MS } from "../../src/core/contract/time-units.ts";
import { AI_TEXT } from "./ai-text.ts";

export const REDDIT_ACCOUNT_GUIDE_URL =
  "https://github.com/KyaniteHQ/threadsift/blob/main/docs/guides/reddit-account.md";

export const REDDIT_ACCOUNT_TEXT = {
  sectionTitle: "Reddit account",
  intro:
    "Connect a Reddit account so Threadsift can read Reddit links added without the extension. Use a separate account, because Reddit’s User Agreement forbids scraping without written consent and the requests use that account’s session.",
  guideLink: "How to find the session cookie",
  fieldLabel: "Session cookie",
  fieldHelp:
    "Paste the value of the reddit_session cookie, with or without the reddit_session= prefix. Threadsift stores it encrypted on this instance, sends it only to reddit.com and never shows it again.",
  fieldPlaceholder: "Session saved",
  stateNone:
    "No Reddit account is connected. Links added without the extension are filled from the archive when Reddit archive fill is On.",
  stateNoneFilled:
    "No Reddit account is connected. Reddit links added without the extension are filled from the Arctic Shift archive.",
  stateNoneLinkOnly:
    "No Reddit account is connected. Reddit links added without the extension stay link-only items. Connect an account or turn Reddit archive fill On to fill them. You can also use the extension to save threads from your tab.",
  stateConnected:
    "A Reddit account is connected. Threadsift uses it to read every Reddit link added without the extension, imports included, one at a time.",
  stateExpired:
    "Reddit stopped accepting the saved session. Connect again. Until then, links added without the extension are filled from the archive when Reddit archive fill is On.",
  stateExpiredFilled:
    "Reddit stopped accepting the saved session. Connect again. Until then, Reddit links added without the extension are filled from the Arctic Shift archive.",
  stateExpiredLinkOnly:
    "Reddit stopped accepting the saved session. Connect again. Until then, Reddit links added without the extension stay link-only items.",
  stateUnreadable:
    "This instance can no longer open the saved session because its secret key changed. Connect again.",
  connect: "Connect",
  connecting: "Connecting…",
  verify: "Verify",
  verifying: "Verifying…",
  disconnect: "Disconnect",
  disconnecting: "Disconnecting…",
  connected: "Reddit account connected",
  disconnected: "Reddit account disconnected",
  removeNothing: "No Reddit account is connected.",
  pasteLead:
    "If the extension isn’t available, paste the cookie value into the Session cookie field.",
  valueNeeded: "Enter a session cookie.",
  invalidValue: `Enter 1 to ${groupedNumber(REDDIT_SESSION_MAX)} characters: letters, digits and . _ ~ + / = % - only. Leave out spaces, semicolons and line breaks.`,
  resultOk: "Reddit accepted the session.",
  resultLoggedOut:
    "Reddit says the session is signed out. Connect again with a new session cookie.",
  resultBlocked:
    "Reddit refused the request. That doesn’t mean the session stopped working. Try again later.",
  resultLimited: "Reddit is limiting requests. Try again in a few minutes.",
  resultUnreachable: "Reddit didn’t answer. Try again.",
  resultTimeout: `Reddit didn’t answer within ${String(REQUEST_DEADLINE_MS / SECOND_MS)} seconds. Try again.`,
  resultNotConfigured: "Connect a Reddit account first.",
  connectExtension: "Connect with the extension",
  connectingExtension: "Connecting with the extension…",
  reconnectExtension: "Reconnect with the extension",
  reconnectingExtension: "Reconnecting with the extension…",
  extensionMissing:
    "The extension didn’t answer. Use Connect Reddit in the extension, or paste the cookie value into the Session cookie field.",
  extensionNoAccess:
    "The extension doesn’t have permission for cookies and reddit.com. Use Connect Reddit once in the extension’s settings to grant it.",
  extensionSignedOut: "This browser isn’t signed in to Reddit. Sign in and try again.",
  extensionScopeRefused:
    "The extension’s agent token doesn’t have the Reddit scope. Create a new token with that scope in the Agent tokens section and enter it in the extension’s settings.",
  extensionTokenRefused:
    "The extension’s agent token isn’t valid or was revoked. Check it in the extension’s settings.",
  extensionUnreachable:
    "The extension couldn’t reach this instance. Check the instance address in the extension’s settings.",
  extensionFailed: "Couldn’t connect with the extension. Try again.",
  loadFailed: "Couldn’t load the Reddit account settings. Reload the page.",
  connectFailed: "Couldn’t connect the Reddit account. Try again.",
  verifyFailed: "Couldn’t verify the saved session. Try again.",
  disconnectFailed: "Couldn’t disconnect the Reddit account. Try again.",
} as const;

const STATE_TEXT = {
  none: REDDIT_ACCOUNT_TEXT.stateNone,
  connected: REDDIT_ACCOUNT_TEXT.stateConnected,
  expired: REDDIT_ACCOUNT_TEXT.stateExpired,
  unreadable: REDDIT_ACCOUNT_TEXT.stateUnreadable,
  missing: AI_TEXT["secret-missing"],
} as const satisfies Record<RedditAccountView["state"], string>;

export const RESULT_TEXT = {
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

const ARCHIVE_STATE_TEXT = {
  none: {
    on: REDDIT_ACCOUNT_TEXT.stateNoneFilled,
    off: REDDIT_ACCOUNT_TEXT.stateNoneLinkOnly,
    unknown: REDDIT_ACCOUNT_TEXT.stateNone,
  },
  expired: {
    on: REDDIT_ACCOUNT_TEXT.stateExpiredFilled,
    off: REDDIT_ACCOUNT_TEXT.stateExpiredLinkOnly,
    unknown: REDDIT_ACCOUNT_TEXT.stateExpired,
  },
} as const;

function archiveFillKey(archiveFill: boolean | null): "on" | "off" | "unknown" {
  if (archiveFill === null) return "unknown";

  return archiveFill ? "on" : "off";
}

export function stateText(state: RedditAccountView["state"], archiveFill: boolean | null): string {
  return state === "none" || state === "expired"
    ? ARCHIVE_STATE_TEXT[state][archiveFillKey(archiveFill)]
    : STATE_TEXT[state];
}
