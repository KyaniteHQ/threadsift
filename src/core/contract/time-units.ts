export const SECOND_MS = 1000;

export const MINUTE_MS = 60 * SECOND_MS;

export const HOUR_MS = 60 * MINUTE_MS;

export const DAY_MS = 24 * HOUR_MS;

export const WEEK_MS = 7 * DAY_MS;

const WHOLE_SECONDS = /^\d+$/u;

export function millisecondsFrom(seconds: number): number {
  return Math.round(seconds * SECOND_MS);
}

export function wholeMillisecondsOf(seconds: string | null): number | null {
  return seconds !== null && WHOLE_SECONDS.test(seconds) ? millisecondsFrom(Number(seconds)) : null;
}
