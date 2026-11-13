import { useCallback, useState } from "react";

import type { Item } from "../../src/http/schemas.ts";
import { useAfter } from "./use-form.ts";
import { waitText } from "./wait-text.ts";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

function useClock(until: number): number {
  const [now, setNow] = useState(Date.now);
  const remaining = until - now;

  const read = useCallback(() => {
    setNow(Date.now());
  }, []);

  useAfter(remaining > 0, Math.min(remaining, MAX_TIMEOUT_MS), read);

  return now;
}

export function WaitText({ wait }: Readonly<{ wait: NonNullable<Item["wait"]> }>) {
  return waitText(wait, useClock(wait.retryAt));
}
