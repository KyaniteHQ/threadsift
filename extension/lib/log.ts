export function logFailure(event: string, cause: unknown): void {
  console.error(`threadsift: ${event}`, cause instanceof Error ? cause.message : "not an Error");
}
