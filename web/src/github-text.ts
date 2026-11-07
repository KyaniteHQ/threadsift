import { groupedNumber } from "../../src/core/format.ts";
import type { GithubRefused } from "../../src/core/github-contract.ts";
import { AI_TEXT } from "./ai-text.ts";
import { filled } from "./text.ts";

export const GITHUB_TEXT = {
  sectionTitle: "GitHub token",
  intro:
    "A token is optional. It raises GitHub’s limit from 60 requests an hour for this Instance’s internet address to 5,000 an hour.",
  stepOne: "Open GitHub’s pre-filled fine-grained token page.",
  stepTwo: "Leave every permission as it is and generate the token.",
  stepThree: "Paste it here.",
  classicNote: "A classic token with no scopes also works.",
  fieldLabel: "Token",
  tokenNone: "No token saved on this Instance.",
  tokenSaved: "Token saved on this Instance.",
  tokenUnreadable:
    "This Instance can no longer open the saved token. Save a new token or remove it.",
  fieldHelp: "The token is kept sealed on this Instance and sent only to api.github.com.",
  guideLink: "GitHub token setup guide",
  save: "Save token",
  saving: "Saving token…",
  saved: "Token saved.",
  verify: "Verify token",
  verifying: "Verifying token…",
  verified: "Token verified. {remaining} of {limit} hourly requests left.",
  remove: "Remove token",
  removing: "Removing token…",
  removed: "Token removed.",
  invalidToken: "Enter a token up to 4,096 characters with no spaces or line breaks.",
  notConfigured: "Save a token first, then run Verify.",
  wrongToken: "GitHub rejected the token. Check it and save it again.",
  unreachable: "Couldn’t reach GitHub. Check the connection and try again.",
  timeout: "GitHub timed out. Try Verify again.",
  githubErrorStatus: "GitHub returned error {status}. Try Verify again.",
  githubError: "GitHub returned a response Threadsift couldn’t use. Try Verify again.",
  loadFailed: "Couldn’t load the GitHub token settings. Reload the page.",
  failed: "Couldn’t save, remove or verify the token. Try again.",
} as const;

export const TOKEN_PLACEHOLDER = "github_pat_…";

export const TOKEN_STATES = {
  none: GITHUB_TEXT.tokenNone,
  saved: GITHUB_TEXT.tokenSaved,
  unreadable: GITHUB_TEXT.tokenUnreadable,
} as const;

export const TOKEN_PAGE =
  "https://github.com/settings/personal-access-tokens/new?name=Threadsift&description=Threadsift+reads+public+repositories+for+pasted+links+at+a+higher+request+limit&expires_in=366";

export const GUIDE_URL =
  "https://github.com/KyaniteHQ/threadsift/blob/main/docs/guides/github-token.md";

export function verifiedText(limit: number, remaining: number): string {
  return filled(GITHUB_TEXT.verified, {
    remaining: groupedNumber(remaining),
    limit: groupedNumber(limit),
  });
}

export function refusalText({ reason, status }: Readonly<GithubRefused>): string {
  switch (reason) {
    case "secret-missing":
      return AI_TEXT["secret-missing"];
    case "not-configured":
      return GITHUB_TEXT.notConfigured;
    case "wrong-token":
      return GITHUB_TEXT.wrongToken;
    case "unreachable":
      return GITHUB_TEXT.unreachable;
    case "timeout":
      return GITHUB_TEXT.timeout;
    case "github-error":
      return status === null
        ? GITHUB_TEXT.githubError
        : filled(GITHUB_TEXT.githubErrorStatus, { status: String(status) });
    default: {
      const exhaustive: never = reason;

      return exhaustive;
    }
  }
}
