import { useCallback } from "react";

import type { XReaderChoice } from "../../src/core/kinds.ts";
import type { XSettingsView } from "../../src/core/x-settings.ts";
import { outcomeOf, useActionFlow } from "./use-settings-action.ts";
import { saveXReader } from "./x-api.ts";
import { X_TEXT } from "./x-text.ts";

export function useXForm(changed: (view: XSettingsView) => void) {
  const { flow, run } = useActionFlow<"save">(X_TEXT.failed);

  const pick = useCallback(
    (reader: XReaderChoice) => {
      void run("save", async () => {
        changed(await saveXReader(reader));

        return null;
      });
    },
    [changed, run],
  );

  return { busy: flow.kind === "running", failed: outcomeOf(flow)?.kind === "error", pick };
}
