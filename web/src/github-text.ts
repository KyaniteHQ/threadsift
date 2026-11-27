import { groupedNumber } from "../../src/core/contract/format.ts";
import type { GithubRefused } from "../../src/core/contract/github-contract.ts";
import { SECRET_INPUT_MAX } from "../../src/core/contract/secret-input.ts";
import { AI_TEXT } from "./ai-text.ts";
import { filled } from "./filled.ts";

export const GITHUB_TEXT = {
  sectionTitle: "GitHub token",
  intro:
    "A token is optional. Without one, GitHub allows 60 requests an hour for this instance’s internet address. With a token, GitHub allows 5,000 an hour.",
  stepOne: "Open GitHub’s fine-grained token page with the name, description and expiry filled in.",
  stepTwo: "Leave every permission as it is and generate the token.",
  stepThree: "Paste it into the Token field.",
  classicNote: "A classic token with no scopes also works.",
  fieldLabel: "Token",
  tokenNone: "No token saved on this instance",
  tokenSaved: "Token saved on this instance",
  tokenUnreadable:
    "This instance can no longer read the saved token. Save a new token or remove the old one.",
  fieldHelp:
    "Threadsift stores the token encrypted on this instance and sends it only to api.github.com.",
  guideLink: "GitHub token setup guide",
  save: "Save token",
  saving: "Saving token…",
  saved: "Token saved",
  verify: "Verify token",
  verifying: "Verifying token…",
  verified: "Token verified: {remaining} of {limit} hourly requests left",
  remove: "Remove token",
  removing: "Removing token…",
  removed: "Token removed",
  removeNothing: "No token saved",
  invalidToken: `Enter a token up to ${groupedNumber(SECRET_INPUT_MAX)} characters long, with no spaces or line breaks.`,
  notConfigured: "Save a token first.",
  wrongToken: "GitHub rejected the token. Check it and save it again.",
  unreachable: "Couldn’t reach GitHub. Check the connection and try again.",
  timeout: "GitHub didn’t respond in time. Try Verify token again.",
  githubErrorStatus: "GitHub responded with an error. Try Verify token again.",
  githubError: "Threadsift couldn’t read GitHub’s response. Try Verify token again.",
  rateLimited: "GitHub is limiting requests. Try Verify token again later.",
  loadFailed: "Couldn’t load the GitHub token settings. Reload the page.",
  saveFailed: "Couldn’t save the token. Try again.",
  verifyFailed: "Couldn’t verify the token. Try again.",
  removeFailed:
    "Couldn’t confirm whether the token was removed. Reload the page to check, or try again.",
} as const;

export const TOKEN_PLACEHOLDER = "github_pat_…";

export const TOKEN_STATES = {
  none: GITHUB_TEXT.tokenNone,
  saved: GITHUB_TEXT.tokenSaved,
  unreadable: GITHUB_TEXT.tokenUnreadable,
} as const;

export const TOKEN_PAGE =
  "https://github.com/settings/personal-access-tokens/new?name=Threadsift&description=Threadsift+reads+public+repositories+for+pasted+links+at+a+higher+request+limit&expires_in=365";

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
      return status === null ? GITHUB_TEXT.githubError : GITHUB_TEXT.githubErrorStatus;
    case "rate-limited":
      return GITHUB_TEXT.rateLimited;
    default: {
      const exhaustive: never = reason;

      return exhaustive;
    }
  }
}
