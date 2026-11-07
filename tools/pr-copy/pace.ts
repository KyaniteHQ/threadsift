import { Inconclusive } from "./check-types.ts";
import { pause, remaining } from "./timeout.ts";

export const SKEW_MS = 10_000;

export const RUN_BUDGET_MS = 240 * 60_000;

const ATTEMPT_MS = 15 * 60_000;

export interface Pace {
  readonly settle: () => Promise<void>;
  readonly done: () => void;
}

export function pacer(budgetEnd: number): Pace {
  let last = 0;

  return {
    settle: () => {
      if (remaining(budgetEnd) < ATTEMPT_MS) {
        return Promise.reject(new Inconclusive("the time budget of the run is spent"));
      }

      return pause(Math.max(0, 2 * SKEW_MS - (Date.now() - last)));
    },
    done: () => {
      last = Date.now();
    },
  };
}
