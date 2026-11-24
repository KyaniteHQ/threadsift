export function logFailure(event: string, cause: unknown): void {
  console.error(`threadsift: ${event}`, cause instanceof Error ? cause.message : "not an Error");
}

export function logRequestFailure(event: string, cause: unknown): void {
  console.error(`threadsift: ${event}`, cause instanceof Error ? cause.name : "not an Error");
}
