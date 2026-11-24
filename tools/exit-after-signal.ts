const EXIT_SIGNALS = ["SIGINT", "SIGTERM"] as const;

export function exitAfterSignal(cleanUp: () => Promise<void>): () => void {
  let leaving = false;
  const release = (): void => {
    for (const signal of EXIT_SIGNALS) process.off(signal, onSignal);
  };
  function onSignal(signal: NodeJS.Signals): void {
    if (leaving) return;
    leaving = true;
    void cleanUp()
      .then(release)
      .then(() => process.kill(process.pid, signal));
  }
  for (const signal of EXIT_SIGNALS) process.on(signal, onSignal);
  return release;
}
