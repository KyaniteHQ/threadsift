import { z } from "zod";

import { groupedNumber } from "./format.ts";
import { REDDIT_ACCOUNT_VIEW_STATES } from "./reddit-account-state-names.ts";

export const REDDIT_SESSION_MAX = 4096;

export const REDDIT_SESSION_COOKIE = "reddit_session";

const SESSION_PREFIX = `${REDDIT_SESSION_COOKIE}=`;

const SESSION_CHARACTERS = /^[\w.~+/=%-]+$/u;

export function redditSessionOf(text: string): string | null {
  const value = text.startsWith(SESSION_PREFIX) ? text.slice(SESSION_PREFIX.length) : text;

  return value.length <= REDDIT_SESSION_MAX && SESSION_CHARACTERS.test(value) ? value : null;
}

export const RedditSessionInputSchema = z.object({ session: z.string() });

export const RedditAccountViewSchema = z.object({
  state: z.enum(REDDIT_ACCOUNT_VIEW_STATES),
  secretReady: z.boolean(),
});

export type RedditAccountView = z.infer<typeof RedditAccountViewSchema>;

const RedditAccountRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: z.enum(["secret-missing"]),
});

export const RedditAccountSaveResponseSchema = z.union([
  RedditAccountViewSchema,
  RedditAccountRefusedSchema,
]);

const REDDIT_VERIFY_RESULTS = [
  "ok",
  "logged-out",
  "blocked",
  "limited",
  "unreachable",
  "timeout",
  "not-configured",
  "secret-missing",
  "unreadable",
] as const;

export const RedditVerifySchema = z.object({ result: z.enum(REDDIT_VERIFY_RESULTS) });

export type RedditVerifyResult = (typeof REDDIT_VERIFY_RESULTS)[number];

export const REDDIT_SESSION_INVALID = `session must be 1 to ${groupedNumber(REDDIT_SESSION_MAX)} characters of letters, digits and . _ ~ + / = % -, with at most one leading ${SESSION_PREFIX}`;
