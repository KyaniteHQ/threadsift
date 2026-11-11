import { useCallback, useState } from "react";

import type { RedditSettings } from "../../src/core/reddit-contract.ts";
import { saveRedditSettings } from "./reddit-api.ts";
import { useGuard } from "./use-form.ts";

export function useRedditForm(changed: (view: RedditSettings) => void) {
  const { busy, guard } = useGuard();
  const [failed, setFailed] = useState(false);

  const pick = useCallback(
    (archiveFill: boolean) => {
      guard(async () => {
        setFailed(false);

        try {
          changed(await saveRedditSettings({ archiveFill }));
        } catch {
          setFailed(true);
        }
      });
    },
    [changed, guard],
  );

  return { busy, failed, pick };
}
