import { useCallback, useMemo } from "react";

import { type Restoring, isRestoring } from "./unavailable.ts";
import { outcomeOf, useActionFlow } from "./use-settings-action.ts";

export function useSaveOnPick<Value, View extends object>(
  save: (value: Value) => Promise<View | Restoring>,
  changed: (view: View) => void,
  failedText: string,
  restoringText: string = failedText,
) {
  const { flow, run } = useActionFlow(useMemo(() => ({ save: failedText }), [failedText]));

  const pick = useCallback(
    (value: Value) => {
      void run("save", async () => {
        const saved = await save(value);

        if (isRestoring(saved)) return { kind: "error", text: restoringText };

        changed(saved);

        return null;
      });
    },
    [changed, restoringText, run, save],
  );

  const outcome = outcomeOf(flow);

  return {
    busy: flow.kind === "running",
    error: outcome?.kind === "error" ? outcome.text : null,
    pick,
  };
}
