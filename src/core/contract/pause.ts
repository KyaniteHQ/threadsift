export function pause(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();

      return;
    }

    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    const timer = setTimeout(finish, milliseconds);

    signal?.addEventListener("abort", finish, { once: true });
  });
}
