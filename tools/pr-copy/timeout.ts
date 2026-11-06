const CALL_TIMEOUT_MS = 30_000;

export function callTimeout(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}
