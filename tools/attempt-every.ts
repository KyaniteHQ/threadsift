import { reportFailure } from "../src/core/kernel/failure-log.ts";

const LATER_STEP_FAILED = { event: "later-cleanup-step-failed", fields: {} } as const;

export function attemptEvery(steps: readonly (() => void)[]): void {
  const failures: unknown[] = [];

  for (const step of steps) {
    try {
      step();
    } catch (error) {
      failures.push(error);
    }
  }

  const [first, ...later] = failures;

  for (const failure of later) reportFailure(LATER_STEP_FAILED, failure);

  if (failures.length > 0) throw first;
}
