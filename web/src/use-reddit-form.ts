import { useCallback } from "react";

import type { RedditSettings } from "../../src/core/reddit-contract.ts";
import { saveRedditSettings } from "./reddit-api.ts";
import { REDDIT_TEXT } from "./reddit-text.ts";
import { outcomeOf, useActionFlow } from "./use-settings-action.ts";

export function useRedditForm(changed: (view: RedditSettings) => void) {
  const { flow, run } = useActionFlow<"save">(REDDIT_TEXT.failed);

  const pick = useCallback(
    (archiveFill: boolean) => {
      void run("save", async () => {
        changed(await saveRedditSettings({ archiveFill }));

        return null;
      });
    },
    [changed, run],
  );

  return { busy: flow.kind === "running", failed: outcomeOf(flow)?.kind === "error", pick };
}
