import { bestEffort } from "../src/core/kernel/failure-log.ts";

const EXIT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

const CLEANUP_FAILED = { event: "exit-cleanup-failed", fields: {} } as const;

export function exitAfterSignal(cleanUp: () => Promise<void>): () => void {
  let leaving = false;
  const release = (): void => {
    for (const signal of EXIT_SIGNALS) process.off(signal, onSignal);
  };
  function onSignal(signal: NodeJS.Signals): void {
    if (leaving) return;
    leaving = true;
    void bestEffort(CLEANUP_FAILED, cleanUp)
      .then(release)
      .then(() => process.kill(process.pid, signal));
  }
  for (const signal of EXIT_SIGNALS) process.on(signal, onSignal);
  return release;
}
