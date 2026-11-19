export interface JobQueue {
  readonly enqueue: (jobIds: readonly number[], delayMs: number) => Promise<void>;
}
