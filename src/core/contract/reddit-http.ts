import { REDDIT_WINDOW_REQUESTS } from "./limits.ts";
import { pause } from "./pause.ts";
import { millisecondsFrom } from "./time-units.ts";

export const OK = 200;

export const LOGGED_OUT = 401;

export const FORBIDDEN = 403;

export const RATE_LIMITED = 429;

const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([LOGGED_OUT, FORBIDDEN]);

const DECIMAL = /^\d+(?:\.\d+)?$/u;

const REQUEST_SPACING_MS = 500;

export interface FillAnswer {
  readonly status: number;
  readonly text: string;
  readonly remaining: string | null;
  readonly reset?: string | null | undefined;
  readonly retryAfter?: string | null | undefined;
}

export interface RedditAnswer extends FillAnswer {
  readonly reset: string | null;
  readonly retryAfter: string | null;
}

export const NO_ANSWER: RedditAnswer = {
  status: 0,
  text: "",
  remaining: null,
  reset: null,
  retryAfter: null,
};

export interface RequestWindow {
  readonly sent: number;
  readonly left: number | null;
}

export const NEW_WINDOW: RequestWindow = { sent: 0, left: null };

export function isSignedOut(status: number): boolean {
  return SIGNED_OUT_STATUSES.has(status);
}

export function leftOf(header: string | null): number | null {
  const text = header?.trim() ?? "";

  return DECIMAL.test(text) ? Number(text) : null;
}

export function millisecondsOf(seconds: string | null): number | null {
  const whole = leftOf(seconds);

  return whole === null ? null : millisecondsFrom(whole);
}

export function spacingWaitMs(lastRequestAt: number): number {
  return Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastRequestAt));
}

export function pauseForSpacing(lastRequestAt: number | null): Promise<void> {
  return pause(lastRequestAt === null ? 0 : spacingWaitMs(lastRequestAt));
}

export function afterRequest(
  { sent, left }: Readonly<RequestWindow>,
  header: string | null,
): RequestWindow {
  const known = leftOf(header) ?? (left === null ? null : Math.max(0, left - 1));

  return { sent: sent + 1, left: known };
}

export function mayAsk({ sent, left }: Readonly<RequestWindow>): boolean {
  return sent < REDDIT_WINDOW_REQUESTS && (left === null || left >= 1);
}

export function windowFits(remaining: string | null, hidden: readonly string[]): boolean {
  const left = leftOf(remaining);

  return left === null || Math.min(hidden.length, REDDIT_WINDOW_REQUESTS - 1) <= left;
}
