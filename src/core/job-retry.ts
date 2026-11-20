const RETRY_DELAYS_MS = [30_000, 120_000] as const;

const EARLY_STALE_DELAYS_MS = [0, 0] as const;

const CAPPED_STALE_DELAY_MS = 30_000;

export const MAX_STALE_REQUEUES = EARLY_STALE_DELAYS_MS.length + 1;

export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function retryDelayMs(attempts: number): number | undefined {
  return RETRY_DELAYS_MS[attempts];
}

export function isLastAttempt(attempts: number): boolean {
  return retryDelayMs(attempts) === undefined;
}

export function isSpent(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}

export function staleDelayMs(staleRequeues: number): number {
  return EARLY_STALE_DELAYS_MS[staleRequeues] ?? CAPPED_STALE_DELAY_MS;
}

export function nextStaleRequeues(staleRequeues: number): number {
  return Math.min(staleRequeues + 1, MAX_STALE_REQUEUES);
}
