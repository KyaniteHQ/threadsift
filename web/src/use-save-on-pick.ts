import { useCallback, useMemo } from "react";

import { outcomeOf, useActionFlow } from "./use-settings-action.ts";

export function useSaveOnPick<Value, View>(
  save: (value: Value) => Promise<View>,
  changed: (view: View) => void,
  failedText: string,
) {
  const { flow, run } = useActionFlow(useMemo(() => ({ save: failedText }), [failedText]));

  const pick = useCallback(
    (value: Value) => {
      void run("save", async () => {
        changed(await save(value));

        return null;
      });
    },
    [changed, run, save],
  );

  return { busy: flow.kind === "running", failed: outcomeOf(flow)?.kind === "error", pick };
}
