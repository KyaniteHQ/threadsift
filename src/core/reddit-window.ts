import { REDDIT_WINDOW_REQUESTS } from "./limits.ts";

const DECIMAL = /^\d+(?:\.\d+)?$/u;

export interface RequestWindow {
  readonly sent: number;
  readonly left: number | null;
}

export const NEW_WINDOW: RequestWindow = { sent: 0, left: null };

function readLeft(header: string | null): number | null {
  const text = header?.trim() ?? "";

  return DECIMAL.test(text) ? Number(text) : null;
}

export function afterRequest(
  { sent, left }: Readonly<RequestWindow>,
  header: string | null,
): RequestWindow {
  const known = readLeft(header) ?? (left === null ? null : Math.max(0, left - 1));

  return { sent: sent + 1, left: known };
}

export function mayAsk({ sent, left }: Readonly<RequestWindow>): boolean {
  return sent < REDDIT_WINDOW_REQUESTS && (left === null || left >= 1);
}
