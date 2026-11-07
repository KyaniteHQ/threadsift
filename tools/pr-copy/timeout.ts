import { setTimeout as sleep } from "node:timers/promises";

const CALL_TIMEOUT_MS = 30_000;

export function remaining(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

export function callTimeout(deadline = Number.POSITIVE_INFINITY): AbortSignal {
  return AbortSignal.timeout(Math.max(1, Math.min(CALL_TIMEOUT_MS, remaining(deadline))));
}

export function pause(ms: number, deadline = Number.POSITIVE_INFINITY): Promise<void> {
  return sleep(Math.min(ms, remaining(deadline)));
}
