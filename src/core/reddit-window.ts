import { REDDIT_WINDOW_REQUESTS } from "./limits.ts";
import { pause } from "./pause.ts";

const DECIMAL = /^\d+(?:\.\d+)?$/u;

const MS_PER_SECOND = 1000;

export const REQUEST_SPACING_MS = 500;

export interface RequestWindow {
  readonly sent: number;
  readonly left: number | null;
}

export const NEW_WINDOW: RequestWindow = { sent: 0, left: null };

export function leftOf(header: string | null): number | null {
  const text = header?.trim() ?? "";

  return DECIMAL.test(text) ? Number(text) : null;
}

export function millisecondsOf(seconds: string | null): number | null {
  const whole = leftOf(seconds);

  return whole === null ? null : Math.round(whole * MS_PER_SECOND);
}

export function pauseForSpacing(lastRequestAt: number | null): Promise<void> {
  return pause(
    lastRequestAt === null ? 0 : Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastRequestAt)),
  );
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
