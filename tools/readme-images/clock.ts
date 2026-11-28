import { DAY_MS } from "../../src/core/contract/time-units.ts";

const REDDIT_DAYS_AGO = 3;

const X_DAYS_AGO = 2;

export const RUN_AT = Date.now();

export const REDDIT_POSTED_AT = RUN_AT - REDDIT_DAYS_AGO * DAY_MS;

export const X_POSTED_AT = RUN_AT - X_DAYS_AGO * DAY_MS;

const yearOf = (at: number) => new Date(at).getUTCFullYear();

export function requireDaysInYear(): void {
  if (yearOf(REDDIT_POSTED_AT) !== yearOf(RUN_AT)) {
    throw new Error(
      `The Reader labels a post from ${String(REDDIT_DAYS_AGO)} days ago as "${String(REDDIT_DAYS_AGO)}d ago" only inside the current year. Run the tool again after January ${String(REDDIT_DAYS_AGO)} (UTC).`,
    );
  }
}
