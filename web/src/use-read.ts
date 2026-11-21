import { useEffect, useState } from "react";

export function useRead<Value>(
  read: (signal: AbortSignal) => Promise<Value>,
  initial: Value,
  failed: Value,
): Value {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const settle = async (): Promise<void> => {
      try {
        const result = await read(signal);

        if (!signal.aborted) setValue(result);
      } catch {
        if (!signal.aborted) setValue(failed);
      }
    };

    void settle();

    return () => {
      controller.abort();
    };
  }, [failed, read]);

  return value;
}
