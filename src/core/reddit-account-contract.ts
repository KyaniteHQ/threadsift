import { z } from "zod";

export const REDDIT_SESSION_MAX = 4096;

const SESSION_PREFIX = "reddit_session=";

const SESSION_CHARACTERS = /^[\w.~+/=%-]+$/u;

export function redditSessionOf(text: string): string | null {
  const value = text.startsWith(SESSION_PREFIX) ? text.slice(SESSION_PREFIX.length) : text;

  return value.length <= REDDIT_SESSION_MAX && SESSION_CHARACTERS.test(value) ? value : null;
}

export const RedditSessionInputSchema = z.object({ session: z.string() });

export const REDDIT_ACCOUNT_VIEW_STATES = [
  "none",
  "connected",
  "expired",
  "unreadable",
  "missing",
] as const;

export const RedditAccountViewSchema = z.object({
  state: z.enum(REDDIT_ACCOUNT_VIEW_STATES),
  secretReady: z.boolean(),
});

export type RedditAccountView = z.infer<typeof RedditAccountViewSchema>;

export const RedditAccountRefusedSchema = z.object({
  kind: z.literal("refused"),
  reason: z.enum(["secret-missing"]),
});

export const RedditAccountSaveResponseSchema = z.union([
  RedditAccountViewSchema,
  RedditAccountRefusedSchema,
]);

export const REDDIT_VERIFY_RESULTS = [
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

export const REDDIT_SESSION_INVALID =
  "session must be 1 to 4,096 characters of letters, digits and . _ ~ + / = % -, with at most one leading reddit_session=";
