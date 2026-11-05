import { useCallback } from "react";

import type { Refusal } from "./access-api.ts";
import type { GoTo } from "./setup-step.ts";

interface Outcomes {
  readonly locked: (seconds: number) => void;
  readonly failed: () => void;
  readonly go?: GoTo | undefined;
  readonly exists?: (() => void) | undefined;
}

export function useOutcome({ locked, failed, go, exists }: Readonly<Outcomes>) {
  return useCallback(
    (result: Readonly<Refusal>) => {
      if (result.kind === "locked") {
        locked(result.retryAfter);
      } else if (result.kind === "unavailable" && go !== undefined) {
        go({ name: "unavailable", reason: result.reason });
      } else if (result.kind === "owner-exists" && exists !== undefined) {
        exists();
      } else {
        failed();
      }
    },
    [exists, failed, go, locked],
  );
}
