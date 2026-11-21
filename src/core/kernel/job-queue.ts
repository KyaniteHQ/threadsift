export interface JobQueue {
  readonly wake?: () => void;
  readonly enqueue: (jobIds: readonly number[], delayMs: number) => Promise<void>;
}
