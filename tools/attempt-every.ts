import { reportFailure } from "../src/core/kernel/failure-log.ts";

const LATER_STEP_FAILED = { event: "later-cleanup-step-failed", fields: {} } as const;

type Step = () => void | Promise<void>;

async function failureOf(step: Step): Promise<unknown[]> {
  try {
    await step();

    return [];
  } catch (error) {
    return [error];
  }
}

async function failuresOf(steps: readonly Step[]): Promise<unknown[]> {
  const [next, ...rest] = steps;

  if (next === undefined) return [];

  return [...(await failureOf(next)), ...(await failuresOf(rest))];
}

export async function attemptEvery(steps: readonly Step[]): Promise<void> {
  const failures = await failuresOf(steps);
  const [first, ...later] = failures;

  for (const failure of later) reportFailure(LATER_STEP_FAILED, failure);

  if (failures.length > 0) throw first;
}
