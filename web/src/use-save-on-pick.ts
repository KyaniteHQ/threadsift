import { useCallback, useMemo } from "react";

import { type Restoring, isRestoring } from "./unavailable.ts";
import { outcomeOf, useActionFlow } from "./use-settings-action.ts";

export function useSaveOnPick<Value, View extends object>({
  save,
  changed,
  texts: { failed, restoring },
}: Readonly<{
  save: (value: Value) => Promise<View | Restoring>;
  changed: (view: View) => void;
  texts: Readonly<{ failed: string; restoring: string }>;
}>) {
  const { flow, run } = useActionFlow(useMemo(() => ({ save: failed }), [failed]));

  const pick = useCallback(
    (value: Value) => {
      void run("save", async () => {
        const saved = await save(value);

        if (isRestoring(saved)) return { kind: "error", text: restoring };

        changed(saved);

        return null;
      });
    },
    [changed, restoring, run, save],
  );

  const outcome = outcomeOf(flow);

  return {
    busy: flow.kind === "running",
    error: outcome?.kind === "error" ? outcome.text : null,
    pick,
  };
}
